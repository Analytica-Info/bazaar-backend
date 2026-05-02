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

exports.addToWishlist = asyncHandler(async (req, res) => {
    const result = await wishlistService.addToWishlist(req.user._id, req.body.productId || req.body.product_id);
    return res.status(200).json(wrap(result));
});

exports.removeFromWishlist = asyncHandler(async (req, res) => {
    const result = await wishlistService.removeFromWishlist(req.user._id, req.body.productId || req.body.product_id);
    return res.status(200).json(wrap(result));
});
