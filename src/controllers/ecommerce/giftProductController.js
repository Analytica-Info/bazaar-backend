const giftProductService = require("../../services/giftProductService");

const logger = require("../../utilities/logger");
exports.setGiftProduct = async (req, res) => {
    try {
        const { productId, variantId, giftThreshold } = req.body;

        const updated = await giftProductService.setGiftProduct({ productId, variantId, giftThreshold });

        return res.status(200).json({
            success: true,
            message: "Gift product updated.",
            product: updated,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
            });
        }
        logger.error({ err: error }, "setGiftProduct error:");
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to set gift product",
        });
    }
};

exports.getGiftProduct = async (req, res) => {
    try {
        const giftProduct = await giftProductService.getGiftProduct();

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
        logger.error({ err: error }, "getGiftProduct error:");
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to get gift product",
        });
    }
};
