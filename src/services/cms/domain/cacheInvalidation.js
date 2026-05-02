'use strict';

const cache = require('../../../utilities/cache');

// CMS content changes only via admin edits.
// Cache key and TTL shared across all CMS reads.
const CMS_CACHE_KEY = cache.key("cms", "data", "v1");
const CMS_CACHE_TTL = 1800; // 30 min

/**
 * Invalidate the cached CMS payload. Called from every update function.
 */
async function invalidateCmsCache() {
    try {
        await cache.del(CMS_CACHE_KEY);
    } catch (_) {
        // cache.del already swallows errors; belt-and-braces.
    }
}

module.exports = { invalidateCmsCache, CMS_CACHE_KEY, CMS_CACHE_TTL };
