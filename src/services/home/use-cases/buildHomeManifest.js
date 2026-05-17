'use strict';

const crypto = require('crypto');
const cache = require('../../../utilities/cache');
const clock = require('../../../utilities/clock');
const logger = require('../../../utilities/logger');
const runtimeConfig = require('../../../config/runtime');
const { registry } = require('../index');

const MANIFEST_VERSION = 1;

/**
 * Compute a short deterministic version hash from any data.
 * @param {*} data
 * @returns {string} 12-char hex
 */
function hashData(data) {
  const serialised = JSON.stringify(data) || 'null';
  return crypto
    .createHash('sha1')
    .update(serialised)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Determine status from rail data.
 * @param {*} data
 * @returns {'ok'|'empty'}
 */
function classifyData(data) {
  if (data === null || data === undefined) return 'empty';
  if (Array.isArray(data) && data.length === 0) return 'empty';
  if (data && typeof data === 'object' && 'products' in data) {
    const products = data.products;
    if (Array.isArray(products) && products.length === 0) return 'empty';
  }
  return 'ok';
}

/**
 * Recursively stringify an object with keys sorted, arrays preserved in order.
 * This ensures {a:1,b:2} and {b:2,a:1} produce identical output.
 *
 * @param {*} value
 * @returns {string}
 */
function stableStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Build a cache key that varies by platform, version, and optional filter/params hash.
 * Default (no filter, no params) uses the short key shape so the common path stays cache-hot.
 *
 * @param {string}     platform
 * @param {string[]|undefined} railFilter
 * @param {object}     params
 * @returns {string}
 */
function buildCacheKey(platform, railFilter, params) {
  const hasFilter = railFilter && railFilter.length > 0;
  const hasParams = params && Object.keys(params).length > 0;

  if (!hasFilter && !hasParams) {
    return cache.key('home', `manifest:${platform}:v${MANIFEST_VERSION}`);
  }

  const filterStr = hasFilter ? stableStringify([...railFilter].sort()) : '';
  const paramsStr = hasParams ? stableStringify(params) : '';
  const hash = crypto
    .createHash('sha1')
    .update(filterStr + '\0' + paramsStr)
    .digest('hex')
    .slice(0, 12);

  return cache.key('home', `manifest:${platform}:v${MANIFEST_VERSION}:f${hash}`);
}

/**
 * Allowed numeric fields for rail param overrides with min/max bounds.
 * @type {Record<string, {min: number, max: number}>}
 */
const NUMERIC_CLAMP = {
  page:           { min: 1, max: 50 },
  limit:          { min: 1, max: 50 },
  firstPageLimit: { min: 1, max: 50 },
  maxItemsFromDb: { min: 1, max: 500 },
};

/**
 * Clamp user-supplied rail params against the allowlist.
 * Only numeric fields in NUMERIC_CLAMP and `categoryId` (string) are passed through.
 * Everything else is dropped. Warns once (caller responsibility) if anything was dropped.
 *
 * @param {object} userParams
 * @returns {{ safe: object, dropped: string[] }}
 */
function clampRailParams(userParams) {
  if (!userParams || typeof userParams !== 'object') return { safe: {}, dropped: [] };

  const safe = {};
  const dropped = [];

  const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);

  for (const [k, v] of Object.entries(userParams)) {
    if (BLOCKED.has(k)) continue;
    if (Object.prototype.hasOwnProperty.call(NUMERIC_CLAMP, k)) {
      const num = Number(v);
      if (!Number.isFinite(num) || Number.isNaN(num)) {
        dropped.push(k);
        continue;
      }
      const { min, max } = NUMERIC_CLAMP[k];
      safe[k] = Math.min(Math.max(Math.trunc(num), min), max);
    } else if (k === 'categoryId') {
      if (typeof v !== 'string') {
        dropped.push(k);
      } else {
        safe[k] = v.slice(0, 64);
      }
    } else {
      dropped.push(k);
    }
  }

  return { safe, dropped };
}

/**
 * Wrap a rail fetch in a per-rail timeout.
 *
 * Note: on timeout this rejects the outer promise but does NOT cancel the underlying
 * Mongoose query. The cursor will continue running until the DB responds, holding a
 * connection-pool slot. Future work: thread AbortSignal into rail fetchers so Mongoose
 * calls can be aborted via cursor.maxTimeMS or session abort.
 *
 * @param {Function} fetchFn  async () => data
 * @param {string}   rail     rail name (for logging)
 * @param {number}   timeoutMs
 * @returns {Promise<*>}
 */
function withRailTimeout(fetchFn, rail, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      logger.warn({ rail, timeoutMs }, 'home rail timed out');
      reject(new Error('RAIL_TIMEOUT'));
    }, timeoutMs);

    fetchFn().then(
      (result) => { clearTimeout(timer); resolve(result); },
      (err)    => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Build the home manifest by orchestrating all registered rails.
 *
 * @param {object}   opts
 * @param {string}   opts.platform      - 'mobile' | 'web'
 * @param {string[]} [opts.rails]       - rail names to include; defaults to all enabled for platform
 * @param {object}   [opts.params]      - { [railName]: { ...overrides } }
 * @returns {Promise<object>} manifest
 */
async function buildHomeManifest({ platform, rails: railFilter, params = {} }) {
  const ttl = runtimeConfig.cache.homeManifestTtl;
  const timeoutMs = runtimeConfig.timeouts.homeRail;
  const cacheKey = buildCacheKey(platform, railFilter, params);

  // Fix 4: get first, then conditionally set — so errors are not cached.
  const cached = await cache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Fix 5: warn about unknown rail names
  let registrations;
  if (railFilter) {
    const unknown = railFilter.filter((name) => registry.resolve(name) === null);
    if (unknown.length > 0) {
      logger.warn({ unknown }, 'home manifest: unknown rail names in ?rails= ignored');
    }
    registrations = railFilter.map((name) => registry.resolve(name)).filter(Boolean);
  } else {
    registrations = registry.list({ platform });
  }

  const results = await Promise.allSettled(
    registrations.map(async (reg) => {
      // Fix 2: clamp user-supplied params before merging
      const userRailParams = params[reg.name] || {};
      const { safe, dropped } = clampRailParams(userRailParams);
      if (dropped.length > 0) {
        logger.warn({ rail: reg.name, dropped }, 'home manifest: unsafe rail params dropped');
      }

      const ctx = { platform, params: { ...reg.defaultParams, ...safe } };
      // Fix 3: per-rail timeout
      const data = await withRailTimeout(() => reg.fetch(ctx), reg.name, timeoutMs);
      return { name: reg.name, data };
    })
  );

  const railEntries = results.map((outcome, idx) => {
    const reg = registrations[idx];
    if (outcome.status === 'rejected') {
      logger.warn({ rail: reg.name, err: outcome.reason }, 'home rail fetch failed');
      return { name: reg.name, status: 'error', data: null, version: null, ttl };
    }
    const { data } = outcome.value;
    const status = classifyData(data);
    const version = hashData(data);
    return { name: reg.name, status, data, version, ttl };
  });

  const manifest = {
    version: MANIFEST_VERSION,
    platform,
    generatedAt: clock.now().toISOString(),
    rails: railEntries,
  };

  // Fix 4: skip cache write if any rail errored
  const hasError = railEntries.some((r) => r.status === 'error');
  if (!hasError) {
    await cache.set(cacheKey, manifest, ttl);
  }

  return manifest;
}

module.exports = buildHomeManifest;
