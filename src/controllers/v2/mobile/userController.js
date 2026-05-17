'use strict';
/**
 * V2 Mobile User Controller (BFF layer)
 * Handles payment history, reviews, dashboard, Tabby history.
 * Orders live in orderController; identity lives in authController (getMe).
 */
const userService = require('../../../services/userService');
const { wrap } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');

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
 * GET /me/payments/tabby/history
 */
exports.getTabbyBuyerHistory = asyncHandler(async (req, res) => {
    const result = await userService.getTabbyBuyerHistory(req.user._id, req.user.createdAt);
    return res.status(200).json(wrap(result));
});
