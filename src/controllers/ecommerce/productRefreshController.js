const productSyncService = require("../../services/productSyncService");

exports.refreshSingleProductById = async (req, res) => {
    try {
        const productId =
            req.headers['x-lightspeed-product-id'] ||
            req.headers['x-product-id'] ||
            req.query.productId ||
            req.body?.productId;

        const result = await productSyncService.refreshSingleProductById(productId);

        return res.status(200).json({
            success: true,
            message: result.created ? 'Product created in MongoDB.' : 'Product updated in MongoDB.',
            created: result.created || false,
            updated: result.updated || false,
            productId: result.productId,
            product: result.product,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
            });
        }
        console.error('refreshSingleProductById error:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to refresh product',
        });
    }
};
