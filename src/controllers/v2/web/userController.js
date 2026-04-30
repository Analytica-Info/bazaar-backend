/**
 * V2 Web User Controller (BFF layer)
 */
const userService = require('../../../services/userService');
const { wrap } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;
const Coupon = require('../../../models/Coupon');

exports.getProfile = async (req, res) => {
    try {
        const { name, email, avatar, username, role, phone, authProvider: provider } = req.user;
        const couponDoc = await Coupon.findOne({ phone });
        return res.status(200).json(wrap({
            name, email, avatar, username, role, phone, provider,
            coupon: { data: couponDoc || [], status: !!couponDoc },
        }));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getOrders = async (req, res) => {
    try {
        const result = await userService.getUserOrders(req.user._id);
        return res.status(200).json(wrap(result));
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
