/**
 * V2 Mobile User Controller (BFF layer)
 * Handles user profile, orders, payment history, reviews.
 */
const userService = require('../../../services/userService');
const { wrap, paginated } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');

exports.getProfile = async (req, res) => {
    try {
        const result = await userService.getProfile(req.user._id);
        return res.status(200).json(wrap(result.user));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getOrders = async (req, res) => {
    try {
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
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getOrder = async (req, res) => {
    try {
        const result = await userService.getOrder(req.user._id, req.params.id);
        return res.status(200).json(wrap({ orders: result.orders }));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getPaymentHistory = async (req, res) => {
    try {
        const result = await userService.getPaymentHistory(req.user._id);
        return res.status(200).json(wrap({ history: result.history }));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getSinglePaymentHistory = async (req, res) => {
    try {
        const result = await userService.getSinglePaymentHistory(req.user._id, req.params.id);
        return res.status(200).json(wrap({ history: result.history }));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getDashboard = async (req, res) => {
    try {
        const result = await userService.getDashboard(req.user._id);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getReviews = async (req, res) => {
    try {
        const result = await userService.getUserReviews(req.user._id);
        return res.status(200).json(wrap({ products: result.products }));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getTabbyBuyerHistory = async (req, res) => {
    try {
        const result = await userService.getTabbyBuyerHistory(req.user._id, req.user.createdAt);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};
