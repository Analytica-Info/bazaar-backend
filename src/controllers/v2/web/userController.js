/**
 * V2 Web User Controller (BFF layer)
 */
const userService = require('../../../services/userService');
const { wrap } = require('../_shared/responseEnvelope');
const { toDomainError } = require('../_shared/errors');
const { asyncHandler } = require('../../../middleware');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

exports.getProfile = asyncHandler(async (req, res) => {
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
    } catch (e) { throw toDomainError(e); }
});

exports.getOrders = asyncHandler(async (req, res) => {
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
    } catch (e) { throw toDomainError(e); }
});

exports.getOrder = asyncHandler(async (req, res) => {
    try {
        const result = await userService.getOrder(req.user._id, req.params.id);
        return res.status(200).json(wrap({ orders: result.orders }));
    } catch (e) { throw toDomainError(e); }
});

exports.getPaymentHistory = asyncHandler(async (req, res) => {
    try {
        const result = await userService.getPaymentHistory(req.user._id);
        return res.status(200).json(wrap({ history: result.history }));
    } catch (e) { throw toDomainError(e); }
});

exports.getSinglePaymentHistory = asyncHandler(async (req, res) => {
    try {
        const result = await userService.getSinglePaymentHistory(req.user._id, req.params.id);
        return res.status(200).json(wrap({ history: result.history }));
    } catch (e) { throw toDomainError(e); }
});

exports.getDashboard = asyncHandler(async (req, res) => {
    try {
        const result = await userService.getDashboard(req.user._id);
        return res.status(200).json(wrap(result));
    } catch (e) { throw toDomainError(e); }
});

exports.getReviews = asyncHandler(async (req, res) => {
    try {
        const result = await userService.getUserReviews(req.user._id);
        return res.status(200).json(wrap({ products: result.products }));
    } catch (e) { throw toDomainError(e); }
});

exports.getCurrentMonthCategories = asyncHandler(async (req, res) => {
    try {
        const result = await userService.getCurrentMonthOrderCategories();
        return res.status(200).json(wrap(result.data, result.message));
    } catch (e) { throw toDomainError(e); }
});

exports.addReview = asyncHandler(async (req, res) => {
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
    } catch (e) { throw toDomainError(e); }
});
