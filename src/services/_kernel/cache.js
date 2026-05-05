'use strict';

/**
 * Cache port adapters.
 *
 * `makeRedisCache(redisClient, opts)` — thin wrapper over src/utilities/cache.js
 *   that implements the Cache port with the canonical method signatures.
 *
 * `makeNullCache()` — no-op adapter for tests and local dev where Redis is absent.
 *
 * Both adapters implement the same Cache port:
 *   { get, set, del, delPattern, getOrSet }
 */

const legacyCache = require('../../utilities/cache');

/**
 * Build a Cache adapter that delegates to the existing Redis-backed
 * utilities/cache module.  The legacy module already handles graceful
 * degradation (CACHE_ENABLED=false, missing client, Redis errors), so this
 * adapter is intentionally thin — it exists only to present the canonical
 * port shape and to centralise the import path.
 *
 * The `redisClient` and `opts` parameters are accepted for forward-compat
 * with tests that supply a fake client, but the legacy module manages its
 * own client internally; callers that need a fully-isolated fake should use
 * `makeNullCache()` or provide a custom adapter.
 *
 * @param {object} _redisClient  - Ignored; legacy module owns the client.
 * @param {object} [opts]
 * @param {object} [opts.logger] - Optional logger (ignored; legacy uses its own).
 * @param {number} [opts.defaultTtlSeconds=300] - Default TTL used by getOrSet when ttl=0.
 * @returns {import('./ports').Cache}
 */
function makeRedisCache(_redisClient, opts) {
  const defaultTtl = (opts && opts.defaultTtlSeconds) || 300;

  return Object.freeze({
    /**
     * @param {string} key
     * @returns {Promise<any>}
     */
    get(key) {
      return legacyCache.get(key);
    },

    /**
     * @param {string} key
     * @param {any} value
     * @param {number} [ttlSeconds]
     * @returns {Promise<boolean>}
     */
    set(key, value, ttlSeconds) {
      return legacyCache.set(key, value, ttlSeconds != null ? ttlSeconds : defaultTtl);
    },

    /**
     * @param {string} key
     * @returns {Promise<number>}
     */
    del(key) {
      return legacyCache.del(key);
    },

    /**
     * @param {string} pattern
     * @returns {Promise<number>}
     */
    delPattern(pattern) {
      return legacyCache.delPattern(pattern);
    },

    /**
     * @param {string} key
     * @param {number} ttlSeconds
     * @param {() => Promise<any>} loader
     * @returns {Promise<any>}
     */
    getOrSet(key, ttlSeconds, loader) {
      return legacyCache.getOrSet(key, ttlSeconds != null ? ttlSeconds : defaultTtl, loader);
    },
  });
}

/**
 * No-op cache adapter — every read is a miss, every write is silently dropped.
 * Safe to use in unit tests and local dev without a Redis instance.
 *
 * @returns {import('./ports').Cache}
 */
function makeNullCache() {
  return Object.freeze({
    get(_key) {
      return Promise.resolve(undefined);
    },
    set(_key, _value, _ttl) {
      return Promise.resolve(false);
    },
    del(_key) {
      return Promise.resolve(0);
    },
    delPattern(_pattern) {
      return Promise.resolve(0);
    },
    async getOrSet(_key, _ttl, loader) {
      return loader();
    },
  });
}

module.exports = { makeRedisCache, makeNullCache };
