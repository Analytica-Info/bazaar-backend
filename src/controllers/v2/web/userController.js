/**
 * V2 Web User Controller (BFF layer)
 */
const userService = require('../../../services/userService');
const { wrap } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

exports.getProfile = async (req, res) => {
    try {
        const result = await userService.getProfile(req.user._id);
        const u = result.user;
        return res.status(200).json(wrap({
            name: u.name,
            email: u.email,
            avatar: u.avatar,
            username: u.username,
            role: u.role,
            phone: u.phone,
            provider: u.authProvider,
            coupon: result.coupon,
        }));
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

exports.getCurrentMonthCategories = async (req, res) => {
    try {
        const result = await userService.getCurrentMonthOrderCategories();
        return res.status(200).json(wrap(result.data, result.message));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.addReview = async (req, res) => {
    try {
        const { name, description, title, product_id, quality_rating, value_rating, price_rating } = req.body;
        const filePath = req.file ? `${FRONTEND_BASE_URL}/${req.file.path.replace(/\\/g, '/')}` : undefined;
        const result = await userService.addReview(req.user._id, {
            productId: product_id,
            name, description, title,
            qualityRating: quality_rating,
            valueRating: value_rating,
            priceRating: price_rating,
        }, filePath);
        return res.status(200).json(wrap({ reviews: result.reviews }, result.message));
    } catch (error) {
        return handleError(res, error);
    }
};
