/**
 * V2 Shared Wishlist Controller (BFF layer)
 */
const wishlistService = require('../../../services/wishlistService');
const { wrap } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');

exports.getWishlist = async (req, res) => {
    try {
        const result = await wishlistService.getWishlist(req.user._id);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.addToWishlist = async (req, res) => {
    try {
        const result = await wishlistService.addToWishlist(req.user._id, req.body);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.removeFromWishlist = async (req, res) => {
    try {
        const result = await wishlistService.removeFromWishlist(req.user._id, req.body);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};
