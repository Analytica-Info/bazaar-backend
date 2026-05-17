'use strict';
/**
 * V2 Web User Controller (BFF layer)
 */
const userService = require('../../../services/userService');
const { wrap } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');

/**
 * GET /orders  (web — user-scoped)
 */
exports.getOrders = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await userService.getUserOrders(req.user._id, { page, limit });
    return res.status(200).json(wrap({
        orders: result.orders,
        total_orders: result.total_orders,
        shipped_orders: result.shipped_orders,
        delivered_orders: result.delivered_orders,
        canceled_orders: result.canceled_orders,
    }));
});

/**
 * GET /orders/:id  (web — user-scoped)
 */
exports.getOrder = asyncHandler(async (req, res) => {
    const result = await userService.getOrder(req.user._id, req.params.id);
    return res.status(200).json(wrap({ orders: result.orders }));
});

/**
 * GET /me/payments
 */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const result = await userService.getPaymentHistory(req.user._id);
    return res.status(200).json(wrap({ history: result.history }));
});

/**
 * GET /me/payments/:id
 */
exports.getSinglePaymentHistory = asyncHandler(async (req, res) => {
    const result = await userService.getSinglePaymentHistory(req.user._id, req.params.id);
    return res.status(200).json(wrap({ history: result.history }));
});

/**
 * GET /me/dashboard
 */
exports.getDashboard = asyncHandler(async (req, res) => {
    const result = await userService.getDashboard(req.user._id);
    return res.status(200).json(wrap(result));
});

/**
 * GET /me/reviews
 */
exports.getReviews = asyncHandler(async (req, res) => {
    const result = await userService.getUserReviews(req.user._id);
    return res.status(200).json(wrap({ products: result.products }));
});

/**
 * GET /me/dashboard/current-month-categories
 */
exports.getCurrentMonthCategories = asyncHandler(async (req, res) => {
    const result = await userService.getCurrentMonthOrderCategories();
    return res.status(200).json(wrap(result.data, result.message));
});

