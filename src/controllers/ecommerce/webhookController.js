const productSyncService = require("../../services/productSyncService");
const logger = require("../../utilities/logger");

// Respond 200 immediately so Lightspeed stops retrying, then process async.
// Previously we awaited the full handler (4–40 s), causing Lightspeed to
// treat the request as timed-out and fire it again — producing 233 duplicate
// calls per product during busy periods.

exports.productUpdate = async (req, res) => {
    const { payload, type } = req.body;
    res.status(200).send({ success: true });

    productSyncService.handleProductUpdate({ payload, type }).catch((err) => {
        logger.error({ err }, 'productUpdate background processing failed');
    });
};

exports.inventoryUpdate = async (req, res) => {
    const { payload, type } = req.body;
    res.status(200).send({ success: true });

    productSyncService.handleInventoryUpdate({ payload, type }).catch((err) => {
        logger.error({ err }, 'inventoryUpdate background processing failed');
    });
};

exports.saleUpdate = async (req, res) => {
    const { payload, type } = req.body;
    res.status(200).send({ success: true });

    productSyncService.handleSaleUpdate({ payload, type }).catch((err) => {
        logger.error({ err }, 'saleUpdate background processing failed');
    });
};
