'use strict';

/**
 * Bazaar Redis-backed cache utility.
 *
 * All methods are safe to call unconditionally:
 *   - If Redis is unreachable or CACHE_ENABLED=false, every operation degrades
 *     gracefully (get → undefined, set → false, del → 0, getOrSet → fetcher()).
 *   - No method ever throws to the caller.
 *
 * Key convention: bazaar:<domain>:<specifier>[:v<n>]
 * Use cache.key(...parts) to build namespaced keys.
 */

const logger = require('./logger');
const { getClient, isEnabled } = require('../config/redis');

const NAMESPACE = 'bazaar:';

/**
 * Prefix a caller-supplied key with the namespace.
 * If the key already starts with the namespace, it is returned as-is.
 */
function ns(k) {
  return k.startsWith(NAMESPACE) ? k : NAMESPACE + k;
}

/**
 * Serialize a value for Redis storage.
 * If the value is already a string, store it as-is.
 */
function serialize(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Deserialize a Redis value.
 * Attempts JSON.parse; falls back to raw string if it isn't valid JSON.
 */
function deserialize(raw) {
  if (raw === null || raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a cached value by key.
 * @param {string} key
 * @returns {Promise<any>} Parsed value, or undefined on miss/error.
 */
async function get(key) {
  if (!isEnabled()) return undefined;
  const client = getClient();
  if (!client) return undefined;

  try {
    const raw = await client.get(ns(key));
    return deserialize(raw);
  } catch (err) {
    logger.warn({ module: 'cache', op: 'get', key, err }, 'Redis get failed');
    return undefined;
  }
}

/**
 * Set a value with a required TTL.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 * @returns {Promise<boolean>} true on success, false on error/disabled.
 */
async function set(key, value, ttlSeconds) {
  if (!isEnabled()) return false;
  const client = getClient();
  if (!client) return false;

  try {
    await client.set(ns(key), serialize(value), 'EX', ttlSeconds);
    return true;
  } catch (err) {
    logger.warn({ module: 'cache', op: 'set', key, err }, 'Redis set failed');
    return false;
  }
}

/**
 * Delete a single key.
 * @param {string} key
 * @returns {Promise<number>} Number of keys deleted (0 or 1).
 */
async function del(key) {
  if (!isEnabled()) return 0;
  const client = getClient();
  if (!client) return 0;

  try {
    return await client.del(ns(key));
  } catch (err) {
    logger.warn({ module: 'cache', op: 'del', key, err }, 'Redis del failed');
    return 0;
  }
}

/**
 * Delete all keys matching a glob pattern.
 * Uses SCAN (not KEYS) so it is safe on production clusters.
 * If the pattern does not already start with the namespace, it is prefixed.
 *
 * @param {string} pattern  e.g. 'catalog:*' or 'bazaar:catalog:*'
 * @returns {Promise<number>} Total number of keys deleted.
 */
async function delPattern(pattern) {
  if (!isEnabled()) return 0;
  const client = getClient();
  if (!client) return 0;

  const namespacedPattern = pattern.startsWith(NAMESPACE) ? pattern : NAMESPACE + pattern;

  let deleted = 0;
  let cursor = '0';

  try {
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', namespacedPattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await client.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ module: 'cache', op: 'delPattern', pattern, err }, 'Redis delPattern failed');
  }

  return deleted;
}

/**
 * Get a cached value, or compute + cache it if absent.
 *
 * Empty-array (and any other falsy-but-valid) results ARE cached.
 * On any Redis error, the fetcher result is returned without caching.
 *
 * @param {string}   key
 * @param {number}   ttlSeconds
 * @param {Function} fetcher  async () => value
 * @returns {Promise<any>}
 */
async function getOrSet(key, ttlSeconds, fetcher) {
  if (!isEnabled()) return fetcher();

  const client = getClient();
  if (!client) return fetcher();

  // Attempt cache read
  try {
    const raw = await client.get(ns(key));
    if (raw !== null && raw !== undefined) {
      return deserialize(raw);
    }
  } catch (err) {
    logger.warn({ module: 'cache', op: 'getOrSet:get', key, err }, 'Redis get failed — falling through to fetcher');
    // Fall through without caching
    return fetcher();
  }

  // Cache miss — run fetcher
  const value = await fetcher();

  // Attempt cache write (best-effort; don't block / throw on failure)
  try {
    await client.set(ns(key), serialize(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ module: 'cache', op: 'getOrSet:set', key, err }, 'Redis set failed after fetcher — returning result without caching');
  }

  return value;
}

/**
 * Convenience key builder — joins parts with ':'.
 * The resulting string should then be passed to get/set/del/getOrSet.
 * The NAMESPACE prefix is added automatically by those methods.
 *
 * @param {...string} parts
 * @returns {string}  e.g. 'catalog:top-rated:v1'
 */
function key(...parts) {
  return parts.join(':');
}

module.exports = {
  NAMESPACE,
  get,
  set,
  del,
  delPattern,
  getOrSet,
  key,
};
