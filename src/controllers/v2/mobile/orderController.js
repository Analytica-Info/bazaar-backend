'use strict';
/**
 * V2 Mobile Order Controller (BFF layer)
 *
 * Address handlers live here for now; TODO: extract to addressController.js in Wave 3+.
 */
const orderService = require('../../../services/orderService');
const { wrap, paginated } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');
const { BadRequestError } = require('../../../services/_kernel/errors');
const logger = require('../../../utilities/logger');

/** GET /orders */
exports.getOrders = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await orderService.getOrders(userId, { page, limit });
    return res.status(200).json(paginated(result.orders, result.total, result.page, result.limit));
});

/** POST /orders/inventory-checks */
exports.createInventoryCheck = asyncHandler(async (req, res) => {
    const { products } = req.body;
    const result = await orderService.validateInventoryBeforeCheckout(products, req.user, 'Mobile App Backend');
    return res.status(200).json(wrap({ isValid: result.isValid, results: result.results }, result.message));
});

/** POST /orders/checkouts/stripe */
exports.createStripeCheckout = asyncHandler(async (req, res) => {
    const result = await orderService.createStripeCheckoutSession(req.user._id, req.body, { fcmToken: req.user?.fcmToken || null });
    return res.status(200).json(wrap({ orderId: result.orderId }, result.message));
});

/** POST /orders/checkouts/tabby */
exports.createTabbyCheckout = asyncHandler(async (req, res) => {
    const result = await orderService.createTabbyCheckoutSession(req.user._id, req.body, { fcmToken: req.user?.fcmToken || null });
    return res.status(200).json(wrap({ paymentId: result.paymentId, status: result.status }, result.message));
});

/**
 * POST /orders/checkouts/tabby/verify
 * Reads paymentId from req.body (was GET with query params before Wave 2).
 */
exports.verifyTabbyCheckout = asyncHandler(async (req, res) => {
    const { paymentId } = req.body;
    const result = await orderService.verifyTabbyPayment(paymentId, req.user._id);
    return res.status(200).json(wrap({ finalStatus: result.finalStatus || null }, result.message));
});

/** POST /orders/checkouts/nomod */
exports.createNomodCheckout = asyncHandler(async (req, res) => {
    const result = await orderService.createNomodCheckoutSession(req.user._id, req.body, { fcmToken: req.user?.fcmToken || null });
    // Service returns snake_case ({ checkout_url, payment_id, status }); v2 envelope is camelCase.
    return res.status(200).json(wrap({
        paymentId: result.payment_id,
        checkoutId: result.payment_id,
        checkoutUrl: result.checkout_url,
        status: result.status,
    }, result.message));
});

/**
 * POST /orders/checkouts/nomod/verify
 * Reads paymentId from req.body (was GET with query params before Wave 2).
 */
exports.verifyNomodCheckout = asyncHandler(async (req, res) => {
    const { paymentId } = req.body;
    const result = await orderService.verifyNomodPayment(paymentId, req.user._id);
    return res.status(200).json(wrap({ finalStatus: result.finalStatus || null }, result.message));
});

/** POST /orders/checkouts/stripe/init */
exports.initStripeCheckout = asyncHandler(async (req, res) => {
    const { amountAED } = req.body;
    if (!amountAED || isNaN(amountAED) || Number(amountAED) <= 0) {
        throw new BadRequestError('amountAED is required and must be a positive number');
    }
    const result = await orderService.initStripePayment(req.user._id, Number(amountAED), req.body);
    return res.status(200).json(wrap(result));
});

/** GET /payment-methods */
exports.listPaymentMethods = asyncHandler(async (req, res) => {
    const methods = await orderService.getPaymentMethods();
    return res.status(200).json(wrap({ methods }));
});

// ── Address handlers ─────────────────────────────────────────────────────────

/** GET /me/addresses */
exports.listAddresses = asyncHandler(async (req, res) => {
    const result = await orderService.getAddresses(req.user._id);
    return res.status(200).json(wrap({ address: result.address, flag: result.flag }));
});

/**
 * POST /me/addresses
 * Create a new address. Body must NOT include _id — use PATCH to update.
 */
exports.createAddress = asyncHandler(async (req, res) => {
    const b = req.body || {};
    if (b._id) {
        return res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Use PATCH /me/addresses/:id to update an existing address.' },
        });
    }
    const allowed = {
        name: b.name, email: b.email, mobile: b.mobile,
        city: b.city, area: b.area, state: b.state,
        country: b.country, countryCode: b.countryCode,
        floorNo: b.floorNo, apartmentNo: b.apartmentNo,
        buildingName: b.buildingName, landmark: b.landmark,
    };
    const result = await orderService.storeAddress(req.user._id, allowed);
    return res.status(200).json(wrap({ addresses: result.addresses }, result.message));
});

/** DELETE /me/addresses/:id — param renamed from :addressId to :id */
exports.deleteAddress = asyncHandler(async (req, res) => {
    const result = await orderService.deleteAddress(req.user._id, req.params.id);
    return res.status(200).json(wrap({ addresses: result.addresses }, 'Address deleted successfully'));
});

/**
 * PATCH /me/addresses/:id
 * Body is a partial patch. Any of:
 *   name, email, mobile, city, area, state, country, countryCode,
 *   floorNo, apartmentNo, buildingName, landmark, primary
 * are honored; absent fields are left untouched. Unknown keys ignored.
 */
exports.updateAddress = asyncHandler(async (req, res) => {
    const result = await orderService.updateAddress(req.user._id, req.params.id, req.body || {});
    return res.status(200).json(wrap({ addresses: result.addresses }, result.message));
});

// ── Order status split ────────────────────────────────────────────────────────

/**
 * POST /orders/:id/proof-of-delivery
 * File-upload path (uses orderUpload.single('file') in the router).
 */
exports.uploadProofOfDelivery = asyncHandler(async (req, res) => {
    const { id: orderId } = req.params;
    const filePath = req.file ? req.file.path : null;
    const order = await orderService.updateOrderStatus(orderId, req.body.status, filePath, req.user._id);
    return res.status(200).json(wrap({ order }, 'Order status updated successfully'));
});

/**
 * PATCH /orders/:id
 * Status-only update (no file). Body: { status: '...' }
 */
exports.updateOrderStatus = asyncHandler(async (req, res) => {
    const { id: orderId } = req.params;
    const { status } = req.body;
    const order = await orderService.updateOrderStatus(orderId, status, null, req.user._id);
    return res.status(200).json(wrap({ order }, 'Order status updated successfully'));
});
