const Product = require("../../models/Product");

exports.setGiftProduct = async (req, res) => {
    try {
        const { productId, variantId, giftThreshold } = req.body;
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "productId is required",
            });
        }

        const product = await Product.findById(productId).lean();
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const variants = Array.isArray(product.variantsData) ? product.variantsData : [];
        let resolvedVariantId = null;
        if (variantId && variants.length > 0) {
            const variant = variants.find((v) => v.id === variantId || v.id === String(variantId));
            if (!variant) {
                return res.status(400).json({
                    success: false,
                    message: "Selected variant not found in this product.",
                });
            }
            const qty = Number(variant.qty);
            if (qty < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Selected variant must have quantity at least 1 to be set as gift.",
                });
            }
            resolvedVariantId = variant.id;
        } else if (variants.length > 0) {
            const firstWithStock = variants.find((v) => Number(v.qty) >= 1);
            resolvedVariantId = firstWithStock ? firstWithStock.id : null;
        }

        const threshold = giftThreshold != null && giftThreshold !== "" ? Number(giftThreshold) : 400;
        if (Number.isNaN(threshold) || threshold < 0) {
            return res.status(400).json({
                success: false,
                message: "Gift threshold must be a valid number (AED) >= 0.",
            });
        }

        await Product.updateMany({}, { $set: { isGift: false, giftVariantId: null } });

        const updated = await Product.findByIdAndUpdate(
            productId,
            { $set: { isGift: true, giftVariantId: resolvedVariantId, giftThreshold: threshold } },
            { new: true }
        ).lean();

        return res.status(200).json({
            success: true,
            message: "Gift product updated.",
            product: updated,
        });
    } catch (error) {
            console.error("setGiftProduct error:", error);
            return res.status(500).json({
            success: false,
            message: error.message || "Failed to set gift product",
        });
    }
};

exports.getGiftProduct = async (req, res) => {
    try {
        const giftProduct = await Product.findOne({ isGift: true }).lean();

        if (!giftProduct) {
            return res.status(200).json({
                success: true,
                giftProduct: null,
                message: "No gift product set.",
            });
        }

        return res.status(200).json({
            success: true,
            giftProduct,
        });
    } catch (error) {
            console.error("getGiftProduct error:", error);
            return res.status(500).json({
            success: false,
            message: error.message || "Failed to get gift product",
        });
    }
};