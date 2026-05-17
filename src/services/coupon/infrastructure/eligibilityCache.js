'use strict';

/**
 * eligibilityCache — thin wrapper around the shared cache utility for
 * coupon eligibility results.
 *
 * All operations are best-effort: a cache miss or Redis error returns
 * undefined and the caller proceeds as a cache miss.
 *
 * Key format: coupon:eligible:v1:<trigger>:<identity>:<cartHash>
 */

const cache = require('../../../utilities/cache');
const crypto = require('crypto');

const KEY_PREFIX = 'coupon:eligible:v1';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Stable JSON stringify — recursively sorts object keys so that
 * { a: 1, b: 2 } and { b: 2, a: 1 } produce the same string.
 *
 * @param {*} value
 * @returns {string}
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const sorted = Object.keys(value)
    .sort()
    .reduce((acc, k) => {
      acc[k] = value[k];
      return acc;
    }, {});
  return '{' + Object.keys(sorted).map((k) => JSON.stringify(k) + ':' + stableStringify(sorted[k])).join(',') + '}';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a cache key for an eligibility result.
 *
 * @param {{ trigger: string, identity: string, cartHash: string }} params
 * @returns {string}
 */
function buildKey({ trigger, identity, cartHash }) {
  return [KEY_PREFIX, trigger, identity, cartHash].join(':');
}

/**
 * Hash a cart object to a 12-hex-char string.
 * Stable across key insertion order.
 *
 * @param {object} cart
 * @returns {string}
 */
function hashCart(cart) {
  const stable = stableStringify(cart || {});
  return crypto.createHash('sha1').update(stable).digest('hex').slice(0, 12);
}

/**
 * Get a cached eligibility result.
 *
 * @param {string} key
 * @returns {Promise<*|undefined>}
 */
async function get(key) {
  try {
    return await cache.get(key);
  } catch (_) {
    return undefined;
  }
}

/**
 * Set a cached eligibility result.
 *
 * @param {string} key
 * @param {*} value
 * @param {number} [ttlSeconds=60]
 * @returns {Promise<boolean>}
 */
async function set(key, value, ttlSeconds = 60) {
  try {
    return await cache.set(key, value, ttlSeconds);
  } catch (_) {
    return false;
  }
}

module.exports = { buildKey, hashCart, get, set };
