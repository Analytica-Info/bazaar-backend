const productSyncService = require("../../services/productSyncService");

exports.getProductsWithProductUpdateWebhook = async (req, res) => {
    try {
        const result = await productSyncService.getProductsWithWebhookUpdate();

        return res.status(200).json({
            success: true,
            count: result.count,
            webhook: result.webhook,
            products: result.products,
        });
    } catch (err) {
        console.error("[getProductsWithProductUpdateWebhook]", err.message);
        return res.status(500).json({
            success: false,
            message: err.message || "Server error",
        });
    }
};

exports.syncProductUpdateWebhookDiscounts = async (req, res) => {
    try {
        const result = await productSyncService.syncWebhookDiscounts();

        return res.status(200).json({
            success: true,
            message: "Discount fields synced (cron logic).",
            distinctParentIds: result.distinctParentIds,
            syncedParentIds: result.syncedParentIds,
            skippedNotEligible: result.skippedNotEligible,
            bulkWriteOperations: result.bulkWriteOperations,
        });
    } catch (err) {
        console.error("[syncProductUpdateWebhookDiscounts]", err.message);
        return res.status(500).json({
            success: false,
            message: err.message || "Server error",
        });
    }
};
