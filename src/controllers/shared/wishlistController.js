const wishlistService = require("../../services/wishlistService");
const { asyncHandler } = require("../../middleware");
const logger = require("../../utilities/logger");

exports.getWishlist = asyncHandler(async (req, res) => {
    try {
        const result = await wishlistService.getWishlist(req.user._id);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        logger.error({ err: err }, "Error fetching wishlist:");
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

exports.addToWishlist = asyncHandler(async (req, res) => {
    const { product_id } = req.body;

    if (!product_id) {
        return res.status(400).json({ success: false, message: "product_id is required" });
    }

    try {
        const result = await wishlistService.addToWishlist(req.user._id, product_id);
        res.status(200).json({ success: true, message: "Product added to wishlist", wishlist: result.wishlist });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        logger.error({ err: err }, "Error adding to wishlist:");
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

exports.removeFromWishlist = asyncHandler(async (req, res) => {
    const { product_id } = req.body;

    if (!product_id) {
        return res.status(400).json({ success: false, message: "product_id is required" });
    }

    try {
        await wishlistService.removeFromWishlist(req.user._id, product_id);
        res.status(200).json({ success: true, message: "Product removed from wishlist" });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        logger.error({ err: err }, "Error removing from wishlist:");
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});
