/**
 * V2 Web Cart Controller (BFF layer)
 */
const cartService = require('../../../services/cartService');
const { wrap } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');

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

exports.getCart = asyncHandler(async (req, res) => {
    const result = await cartService.getCart(req.user._id);
    return res.status(200).json(wrap(result));
});

exports.addToCart = asyncHandler(async (req, res) => {
    const result = await cartService.addToCart(req.user._id, pickItemFields(req.body));
    return res.status(200).json(wrap(result));
});

exports.removeFromCart = asyncHandler(async (req, res) => {
    const result = await cartService.removeFromCart(req.user._id, req.body.product_id);
    return res.status(200).json(wrap(result));
});

exports.increaseQty = asyncHandler(async (req, res) => {
    const qty = Number(req.body.qty) || 1;
    const result = await cartService.increaseQty(req.user._id, req.body.product_id, qty);
    return res.status(200).json(wrap(result));
});

exports.decreaseQty = asyncHandler(async (req, res) => {
    const qty = Number(req.body.qty) || 1;
    const result = await cartService.decreaseQty(req.user._id, req.body.product_id, qty);
    return res.status(200).json(wrap(result));
});
