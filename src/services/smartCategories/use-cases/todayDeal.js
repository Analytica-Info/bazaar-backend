'use strict';

const cache = require('../../../utilities/cache');
const runtimeConfig = require('../../../config/runtime');
const { buildOrderDerivedRail } = require('./buildOrderDerivedRail');

/**
 * Get today's deal products.
 *
 * Time window : 72 h
 * Primary sort: discount-desc (highest discount first)
 * Secondary   : sold-desc (tie-break by volume)
 * Slice       : 10
 * Cache key   : catalog:today-deal:v1
 */
async function todayDeal() {
    return buildOrderDerivedRail({
        cacheKey: cache.key('catalog', 'today-deal', 'v1'),
        ttlSeconds: runtimeConfig.cache.smartCategoryTtl,
        windowHours: 72,
        sliceCount: 10,
        primarySort: 'discount-desc',
        secondarySort: 'sold-desc',
        productMatch: { totalQty: { $gt: 0 } },
        requireSoldProducts: false,
    });
}

module.exports = { todayDeal };
