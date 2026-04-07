const Wishlist = require("../../models/Wishlist");

exports.getWishlist = async (req, res) => {
    const user_id = req.user._id;

    try {
        const wishlist = await Wishlist.findOne({ user: user_id }).populate('items');
        
        res.status(200).json({
            success: true,
            wishlistCount: wishlist?.items?.length || 0,
            wishlist: wishlist?.items || []
        });
    } catch (err) {
        console.error("Error fetching wishlist:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.addToWishlist = async (req, res) => {
    const { product_id } = req.body;
    const user_id = req.user._id;

    if (!product_id) {
        return res.status(400).json({ success: false, message: "product_id is required" });
    }

    try {
        let wishlist = await Wishlist.findOne({ user: user_id });

        if (!wishlist) {
            wishlist = new Wishlist({ user: user_id, items: [product_id] });
        } else {
            if (wishlist.items.includes(product_id)) {
                return res.status(200).json({
                    success: false,
                    message: "Product is already in the wishlist"
                });
            }
            wishlist.items.push(product_id);
        }

        await wishlist.save();
        res.status(200).json({
            success: true,
            message: "Product added to wishlist",
            wishlist: wishlist.items
        });
    } catch (err) {
        console.error("Error adding to wishlist:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.removeFromWishlist = async (req, res) => {
    const { product_id } = req.body;
    const user_id = req.user._id;

    if (!product_id) {
        return res.status(400).json({ success: false, message: "product_id is required" });
    }

    try {
        await Wishlist.findOneAndUpdate(
            { user: user_id },
            { $pull: { items: product_id } }
        );

        res.status(200).json({
            success: true,
            message: "Product removed from wishlist"
        });
    } catch (err) {
        console.error("Error removing from wishlist:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}; 