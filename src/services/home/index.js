'use strict';

/**
 * Home service bootstrap — importing this file registers all rails.
 */

require('./rails/categories');
require('./rails/categoriesProduct');
require('./rails/newArrivals');
require('./rails/hotOffers');
require('./rails/flashSales');
require('./rails/todayDeal');
require('./rails/trending');
require('./rails/topRated');
require('./rails/favouritesOfWeek');

const registry = require('./registry');

module.exports = { registry };
