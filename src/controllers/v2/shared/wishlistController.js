'use strict';

/**
 * V2 Shared Wishlist Controller (BFF layer)
 */
const wishlistService = require('../../../services/wishlistService');
const { wrap } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');

exports.getWishlist = asyncHandler(async (req, res) => {
    const result = await wishlistService.getWishlist(req.user._id);
    return res.status(200).json(wrap(result));
});

/**
 * POST /v2/wishlist/items
 * Body: { productId } or { product_id }
 */
exports.addItem = asyncHandler(async (req, res) => {
    const result = await wishlistService.addToWishlist(req.user._id, req.body.productId || req.body.product_id);
    return res.status(200).json(wrap(result));
});

/**
 * DELETE /v2/wishlist/items/:productId
 * Product ID is now a URL param (Wave 3 rename from body).
 */
exports.removeItem = asyncHandler(async (req, res) => {
    const result = await wishlistService.removeFromWishlist(req.user._id, req.params.productId);
    return res.status(200).json(wrap(result));
});

// Keep old names as aliases so existing mock imports in tests still compile.
exports.addToWishlist = exports.addItem;
exports.removeFromWishlist = exports.removeItem;
