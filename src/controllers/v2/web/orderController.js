'use strict';
/**
 * V2 Web Order Controller (BFF layer)
 *
 * Address handlers live here for now; TODO: extract to addressController.js in Wave 3+.
 */
const orderService = require('../../../services/orderService');
const checkoutService = require('../../../services/checkoutService');
const { wrap } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');

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

/** DELETE /me/addresses/:id */
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

// ── Order handlers ────────────────────────────────────────────────────────────

/** POST /orders/inventory-checks */
exports.createInventoryCheck = asyncHandler(async (req, res) => {
    const { products } = req.body;
    const result = await orderService.validateInventoryBeforeCheckout(products, req.user, 'Web');
    return res.status(200).json(wrap({ isValid: result.isValid, results: result.results }, result.message));
});

/** POST /orders/checkouts/nomod */
exports.createNomodCheckout = asyncHandler(async (req, res) => {
    const result = await checkoutService.createNomodCheckout(req);
    return res.status(200).json(wrap(
        { checkoutId: result.checkout_id, checkoutUrl: result.checkout_url, status: result.status },
        'Checkout session created'
    ));
});

/** POST /orders/checkouts/nomod/verify */
exports.verifyNomodCheckout = asyncHandler(async (req, res) => {
    const result = await checkoutService.verifyNomodPayment(req);
    return res.status(200).json(wrap(
        { orderId: result.orderId || null },
        result.message
    ));
});
