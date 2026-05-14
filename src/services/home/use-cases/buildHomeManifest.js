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
  const cacheKey = cache.key('home', `manifest:${platform}:v${MANIFEST_VERSION}`);

  return cache.getOrSet(cacheKey, ttl, async () => {
    const registrations = railFilter
      ? railFilter.map((name) => registry.resolve(name)).filter(Boolean)
      : registry.list({ platform });

    const results = await Promise.allSettled(
      registrations.map(async (reg) => {
        const ctx = { platform, params: { ...reg.defaultParams, ...(params[reg.name] || {}) } };
        const data = await reg.fetch(ctx);
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

    return {
      version: MANIFEST_VERSION,
      platform,
      generatedAt: clock.now().toISOString(),
      rails: railEntries,
    };
  });
}

module.exports = buildHomeManifest;
