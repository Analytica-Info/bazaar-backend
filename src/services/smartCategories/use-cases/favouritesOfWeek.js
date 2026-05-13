'use strict';

const cache = require('../../../utilities/cache');
const runtimeConfig = require('../../../config/runtime');
const { buildOrderDerivedRail } = require('./buildOrderDerivedRail');

// 7 days expressed in hours so buildOrderDerivedRail can use the shared MS_PER_HOUR constant
const SEVEN_DAYS_IN_HOURS = 7 * 24;

/**
 * Get favourites of the week based on sales in the last 7 days.
 *
 * Time window : 168 h (7 days)
 * Primary sort: sold-desc
 * Secondary   : discount-desc (tie-break by discount)
 * Pre-slice   : 20 (top-20 sold products before merging with random fallback)
 * Slice       : 10
 * Cache key   : catalog:favourites-of-week:v1
 * Early exit  : returns { status:false, count:0, products:[] } when no sold products found
 */
async function favouritesOfWeek() {
    return buildOrderDerivedRail({
        cacheKey: cache.key('catalog', 'favourites-of-week', 'v1'),
        ttlSeconds: runtimeConfig.cache.smartCategoryTtl,
        windowHours: SEVEN_DAYS_IN_HOURS,
        sliceCount: 10,
        primarySort: 'sold-desc',
        secondarySort: 'discount-desc',
        productMatch: { totalQty: { $gt: 0 } },
        preSliceCount: 20,
        requireSoldProducts: true,
    });
}

module.exports = { favouritesOfWeek };
