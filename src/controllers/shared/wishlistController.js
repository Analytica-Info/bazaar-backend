const wishlistService = require("../../services/wishlistService");

exports.getWishlist = async (req, res) => {
    try {
        const result = await wishlistService.getWishlist(req.user._id);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error("Error fetching wishlist:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.addToWishlist = async (req, res) => {
    const { product_id } = req.body;

    if (!product_id) {
        return res.status(400).json({ success: false, message: "product_id is required" });
    }

    try {
        const result = await wishlistService.addToWishlist(req.user._id, product_id);
        res.status(200).json({ success: true, message: "Product added to wishlist", wishlist: result.wishlist });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error("Error adding to wishlist:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.removeFromWishlist = async (req, res) => {
    const { product_id } = req.body;

    if (!product_id) {
        return res.status(400).json({ success: false, message: "product_id is required" });
    }

    try {
        await wishlistService.removeFromWishlist(req.user._id, product_id);
        res.status(200).json({ success: true, message: "Product removed from wishlist" });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ success: false, message: err.message });
        console.error("Error removing from wishlist:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
