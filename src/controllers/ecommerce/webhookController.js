const productSyncService = require("../../services/productSyncService");

const logger = require("../../utilities/logger");
exports.productUpdate = async (req, res) => {
    try {
        const { payload, type } = req.body;

        const result = await productSyncService.handleProductUpdate({ payload, type });

        if (result.skipped) {
            return res.status(200).send({ message: 'Duplicate update skipped' });
        }

        return res.status(200).send({ success: true });
    } catch (error) {
        if (error.status) {
            console.log(error.message);
            return res.status(error.status).send({ error: error.message });
        }
        console.log("Server error:", error);
        return res.status(500).send({ error: "Internal Server Error" });
    }
};

exports.inventoryUpdate = async (req, res) => {
    try {
        const { payload, type } = req.body;

        await productSyncService.handleInventoryUpdate({ payload, type });

        return res.status(200).send({ success: true });
    } catch (error) {
        if (error.status) {
            console.log(error.message);
            return res.status(error.status).send({ error: error.message });
        }
        console.log("Server error:", error);
        return res.status(500).send({ error: "Internal Server Error" });
    }
};

exports.saleUpdate = async (req, res) => {
    try {
        const { payload, type } = req.body;

        await productSyncService.handleSaleUpdate({ payload, type });

        return res.status(200).send({ success: true });
    } catch (error) {
        if (error.status) {
            console.log(error.message);
            return res.status(error.status).send({ error: error.message });
        }
        console.log("Server error:", error);
        return res.status(500).send({ error: "Internal Server Error" });
    }
};
