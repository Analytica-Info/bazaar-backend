'use strict';

const { getHotOffers } = require('./use-cases/getHotOffers');
const { productsByPrice } = require('./use-cases/productsByPrice');
const { getTopRatedProducts } = require('./use-cases/getTopRatedProducts');
const { getTrendingProducts } = require('./use-cases/getTrendingProducts');
const { todayDeal } = require('./use-cases/todayDeal');
const { getNewArrivals } = require('./use-cases/getNewArrivals');
const { getFlashSales } = require('./use-cases/getFlashSales');
const { getSuperSaverProducts } = require('./use-cases/getSuperSaverProducts');
const { favouritesOfWeek } = require('./use-cases/favouritesOfWeek');
const { storeFlashSales } = require('./use-cases/storeFlashSales');

module.exports = {
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
};
