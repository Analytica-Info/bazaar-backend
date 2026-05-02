'use strict';

/**
 * Smart-categories service facade.
 *
 * Thin re-export layer — all logic lives in src/services/smartCategories/.
 * Controllers import from here; the public API is unchanged.
 */

const {
    getHotOffers,
    productsByPrice,
    getTopRatedProducts,
    getTrendingProducts,
    todayDeal,
    getNewArrivals,
    getFlashSales,
    getSuperSaverProducts,
    favouritesOfWeek,
    storeFlashSales,
} = require('./smartCategories');

exports.getHotOffers = getHotOffers;
exports.productsByPrice = productsByPrice;
exports.getTopRatedProducts = getTopRatedProducts;
exports.getTrendingProducts = getTrendingProducts;
exports.todayDeal = todayDeal;
exports.getNewArrivals = getNewArrivals;
exports.getFlashSales = getFlashSales;
exports.getSuperSaverProducts = getSuperSaverProducts;
exports.favouritesOfWeek = favouritesOfWeek;
exports.storeFlashSales = storeFlashSales;
