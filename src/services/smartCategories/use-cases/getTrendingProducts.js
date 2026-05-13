'use strict';

const cache = require('../../../utilities/cache');
const runtimeConfig = require('../../../config/runtime');
const { buildOrderDerivedRail } = require('./buildOrderDerivedRail');

/**
 * Get trending products based on recent sales.
 *
 * Time window : parameterised — 72 h (ecommerce) or 100 h (mobile)
 * Primary sort: sold-desc
 * Slice       : 10
 * Cache key   : catalog:trending:w{timeWindowHours}:v1
 * Early exit  : returns { status:false, count:0, products:[] } when no sold products found
 *
 * @param {object} opts
 * @param {number} opts.timeWindowHours - 72 for ecommerce, 100 for mobile
 */
async function getTrendingProducts({ timeWindowHours }) {
    return buildOrderDerivedRail({
        cacheKey: cache.key('catalog', 'trending', `w${timeWindowHours}`, 'v1'),
        ttlSeconds: runtimeConfig.cache.smartCategoryTtl,
        windowHours: timeWindowHours,
        sliceCount: 10,
        primarySort: 'sold-desc',
        secondarySort: null,
        requireSoldProducts: true,
    });
}

module.exports = { getTrendingProducts };
