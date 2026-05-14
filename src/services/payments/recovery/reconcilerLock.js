'use strict';

/**
 * reconcilerLock.js — Redis-backed distributed mutex for the payment reconciler.
 *
 * Prevents multiple cron-worker instances (horizontal scale-out) from running the
 * reconciler simultaneously. Uses Redis SET NX EX semantics: the first caller
 * acquires the lock and all others skip their cycle until the TTL expires or the
 * lock is explicitly released.
 *
 * FALLBACK: When Redis is not configured (REDIS_URL unset or CACHE_ENABLED=false),
 * the cache module returns undefined/false for all operations. In that scenario,
 * acquireLock returns a synthetic token (always-acquired) so single-instance
 * deployments and local dev work without Redis. Document this at call site.
 *
 * RELEASE SEMANTICS: releaseLock is best-effort. It reads the current value and
 * deletes only if the stored token matches. This is NOT atomic — a true race-free
 * release requires a Lua script (EVAL). The risk is small: if the lock expires
 * between the GET and DEL, another instance may have acquired it and we'd
 * incorrectly delete their lock. Acceptable given the lock TTL is intentionally
 * short relative to the reconciler interval. A Lua-based atomic release can be
 * added here as a future improvement without changing the public API.
 */

const crypto = require('crypto');
const redis = require('../../../config/redis');
const { NAMESPACE } = require('../../../utilities/cache');

/** Sentinel value used as the lock value when Redis is absent. */
const NO_REDIS_TOKEN = 'no-redis-single-instance';

/**
 * Attempt to acquire an exclusive lock via Redis SET NX EX.
 *
 * @param {string} key          - Lock key (without namespace; ns is added internally)
 * @param {number} ttlSeconds   - Lock TTL; should be a bit less than the reconciler interval
 * @returns {Promise<string|null>}
 *   - Returns the lock token (a UUID) if acquired
 *   - Returns null if another instance holds the lock
 *   - Returns NO_REDIS_TOKEN when Redis is unavailable (single-instance fallback)
 */
async function acquireLock(key, ttlSeconds) {
    // Call isEnabled / getClient via module reference so spies work in tests
    const redisEnabled = redis.isEnabled();
    const client = redisEnabled ? redis.getClient() : null;

    if (!redisEnabled || !client) {
        // No Redis — behave as single instance, always "acquire"
        return NO_REDIS_TOKEN;
    }

    const token = crypto.randomUUID();
    const nsKey = NAMESPACE + key;

    try {
        // SET key token NX EX ttl — returns 'OK' on success, null if key already exists
        const result = await client.set(nsKey, token, 'NX', 'EX', ttlSeconds);
        return result === 'OK' ? token : null;
    } catch (err) {
        // On Redis error, fall back to single-instance behaviour
        return NO_REDIS_TOKEN;
    }
}

/**
 * Release the lock — only if the stored token still matches (i.e. we still own it).
 *
 * NOTE: This is best-effort, not atomic. See module JSDoc for details.
 *
 * @param {string} key    - Same key passed to acquireLock
 * @param {string} token  - Token returned by acquireLock
 * @returns {Promise<void>}
 */
async function releaseLock(key, token) {
    // Synthetic token from fallback path — nothing to release
    if (token === NO_REDIS_TOKEN) return;

    const redisEnabled = redis.isEnabled();
    if (!redisEnabled) return;

    const client = redis.getClient();
    if (!client) return;

    const nsKey = NAMESPACE + key;

    try {
        const current = await client.get(nsKey);
        if (current === token) {
            await client.del(nsKey);
        }
        // If current !== token, the TTL expired and another instance holds the lock — leave it alone
    } catch (_err) {
        // Best-effort; errors here are non-fatal
    }
}

module.exports = { acquireLock, releaseLock, NO_REDIS_TOKEN };
