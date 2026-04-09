const orderService = require("../../services/orderService");

const logger = require("../../utilities/logger");
exports.storeAddress = async (req, res) => {
    try {
        const userId = req.user._id;
        const result = await orderService.storeAddress(userId, req.body);

        res.status(200).json({
            success: true,
            message: result.message,
            addresses: result.addresses
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId } = req.params;
        const result = await orderService.deleteAddress(userId, addressId);

        res.status(200).json({
            success: true,
            message: "Address deleted successfully",
            addresses: result.addresses
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        logger.error({ err: error }, "Error deleting address:");
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.setPrimaryAddress = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId } = req.params;
        const result = await orderService.setPrimaryAddress(userId, addressId);

        res.status(200).json({
            success: true,
            message: "Primary address set successfully",
            addresses: result.addresses
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        logger.error({ err: error }, "Error setting primary address:");
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

exports.address = async (req, res) => {
    try {
        const userId = req.user._id;
        const result = await orderService.getAddresses(userId);

        res.status(200).json({
            success: true,
            flag: result.flag,
            address: result.address
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message, flag: false });
        }
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
            flag: false
        });
    }
};

exports.validateInventoryBeforeCheckout = async (req, res) => {
    try {
        const { products } = req.body;
        const user = req.user || {};
        const result = await orderService.validateInventoryBeforeCheckout(products, user, 'Website Backend');

        return res.status(200).json({
            success: true,
            isValid: result.isValid,
            message: result.message,
            results: result.results
        });
    } catch (error) {
        if (error.status && error.data) {
            return res.status(error.status).json(error.data);
        }
        logger.error({ err: error }, 'Error validating inventory:');
        const user = req.user || {};
        const { logActivity } = require("../../utilities/activityLogger");
        const { logBackendActivity } = require("../../utilities/backendLogger");
        await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Inventory Validation',
            status: 'failure',
            message: `Internal server error: ${error.message}`,
            user,
            details: {
                error_details: error.message,
                stack: error.stack,
                request_returned: true,
                response_status: 500
            }
        });
        await logBackendActivity({
            platform: 'Website Backend',
            activity_name: 'Inventory Validation Before Checkout',
            status: 'failure',
            message: `Internal server error: ${error.message}`,
            execution_path: 'orderController.validateInventoryBeforeCheckout',
            error_details: error.message
        });
        return res.status(500).json({
            success: false,
            isValid: false,
            message: 'Internal server error while validating inventory',
            error: error.message
        });
    }
};

exports.uploadProofOfDelivery = async (req, res) => {
    try {
        const orderId = req.body.order_id;
        const result = await orderService.uploadProofOfDelivery(orderId, req.files, req.body.proof_of_delivery);

        return res.status(200).json({
            success: true,
            message: result.message,
            order_id: result.order_id,
            proof_of_delivery: result.proof_of_delivery,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
            });
        }
        logger.error({ err: error }, 'uploadProofOfDelivery error:');
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to save proof of delivery',
        });
    }
};
