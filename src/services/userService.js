'use strict';

// ---------------------------------------------------------------------------
// Thin facade — all logic lives in src/services/user/use-cases/ and domain/
// ---------------------------------------------------------------------------

const { getUserOrders, getOrder } = require('./user/use-cases/getUserOrders');
const { getPaymentHistory, getSinglePaymentHistory } = require('./user/use-cases/getPaymentHistory');
const { getTabbyBuyerHistory } = require('./user/use-cases/getTabbyBuyerHistory');
const { getDashboard } = require('./user/use-cases/getDashboard');
const { getCurrentMonthOrderCategories } = require('./user/use-cases/getCurrentMonthOrderCategories');
const { getUserReviews } = require('./user/use-cases/getUserReviews');
const { addReview } = require('./user/use-cases/addReview');
const { getProfile, getOrderCount } = require('./user/use-cases/getProfile');

module.exports = {
  getUserOrders,
  getOrder,
  getPaymentHistory,
  getSinglePaymentHistory,
  getTabbyBuyerHistory,
  // Backward-compatibility alias (mobile authController still imports this name)
  getMobilePaymentHistory: getTabbyBuyerHistory,
  getDashboard,
  getCurrentMonthOrderCategories,
  getUserReviews,
  addReview,
  getProfile,
  getOrderCount,
};
