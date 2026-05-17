'use strict';
/**
 * V2 Mobile Cart Controller (BFF layer)
 */
const cartService = require('../../../services/cartService');
const { wrap } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');
const { BadRequestError } = require('../../../services/_kernel/errors');

const DELTA_MAX = 100;

const pickItemFields = (b) => ({
    product_id: b.product_id,
    product_type_id: b.product_type_id,
    qty: b.qty,
    p_image: b.p_image,
    p_name: b.p_name,
    p_originalPrice: b.p_originalPrice,
    p_id: b.p_id,
    p_totalAvailableQty: b.p_totalAvailableQty,
    variantId: b.variantId,
    variantName: b.variantName,
    variantPrice: b.variantPrice,
});

/** GET /cart */
exports.getCart = asyncHandler(async (req, res) => {
    const result = await cartService.getCart(req.user._id);
    return res.status(200).json(wrap(result));
});

/** POST /cart/items — body shape unchanged */
exports.addItem = asyncHandler(async (req, res) => {
    const result = await cartService.addToCart(req.user._id, pickItemFields(req.body));
    return res.status(200).json(wrap(result));
});

/** DELETE /cart/items/:productId — productId from URL param */
exports.removeItem = asyncHandler(async (req, res) => {
    const result = await cartService.removeFromCart(req.user._id, req.params.productId);
    return res.status(200).json(wrap(result));
});

/**
 * PATCH /cart/items/:productId
 * Body: { delta: N }
 *   delta > 0  → increase qty by N  (capped at +100)
 *   delta < 0  → decrease qty by |N| (capped at -100)
 *   delta === 0 or missing → 400
 *
 * The increase/decrease services accept a `qty` (absolute step count) parameter
 * natively, so we pass Math.abs(delta) directly.
 */
exports.updateItemQuantity = asyncHandler(async (req, res) => {
    const delta = Number(req.body.delta);

    if (!req.body.delta || isNaN(delta) || delta === 0) {
        throw new BadRequestError('delta is required and must be a non-zero integer');
    }
    if (Math.abs(delta) > DELTA_MAX) {
        throw new BadRequestError(`delta must be between -${DELTA_MAX} and +${DELTA_MAX}`);
    }

    const productId = req.params.productId;
    let result;
    if (delta > 0) {
        result = await cartService.increaseQty(req.user._id, productId, delta);
    } else {
        result = await cartService.decreaseQty(req.user._id, productId, Math.abs(delta));
    }
    return res.status(200).json(wrap(result));
});
