const orderService = require("../../services/orderService");
const { logActivity } = require('../../utilities/activityLogger');
const { logBackendActivity } = require('../../utilities/backendLogger');

const logger = require("../../utilities/logger");
exports.checkoutSession = async (req, res) => {
    try {
        const userId = req.user._id;
        const headers = { fcmToken: req.user?.fcmToken || null };
        const result = await orderService.createStripeCheckoutSession(userId, req.body, headers);

        res.status(200).json({
            message: result.message,
            orderId: result.orderId,
        });
    } catch (error) {
        logger.info('sendPushNotification Error' || 'fcmToken not available');
        console.error(error);

        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }

        const user = req.user || {};
        await logActivity({
            platform: 'Mobile App Backend',
            log_type: 'backend_activity',
            action: 'Order Checkout',
            status: 'failure',
            message: `Checkout failed: ${error.message}`,
            user: user,
            details: {
                error_details: error.message,
                stack: error.stack
            }
        });
        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Checkout Session API Hit',
            status: 'failure',
            message: `Stripe checkoutSession failed: ${error.message}`,
            execution_path: 'orderController.checkoutSession (catch)',
            error_details: error.message
        });

        res.status(500).json({ error: error.message });
    }
};

exports.checkoutSessionTabby = async (req, res) => {
    try {
        const userId = req.user._id;
        const headers = { fcmToken: req.user?.fcmToken || null };
        const result = await orderService.createTabbyCheckoutSession(userId, req.body, headers);

        return res.status(200).json({
            message: result.message,
            paymentId: result.paymentId,
            status: result.status
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        logger.error({ err: error }, "Error storing order data:");
        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Checkout Session Tabby API Hit',
            status: 'failure',
            message: `Tabby checkoutSessionTabby failed: ${error.message}`,
            execution_path: 'orderController.checkoutSessionTabby (catch)',
            error_details: error.message
        });
        res.status(500).json({ error: error.message });
    }
};

exports.verifyTabbyPayment = async (req, res) => {
    try {
        const { paymentId } = req.query;
        const result = await orderService.verifyTabbyPayment(paymentId);

        if (result.finalStatus) {
            return res.status(200).json({ message: result.message, finalStatus: result.finalStatus });
        }
        return res.status(200).json({ message: result.message });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        logger.error({ err: error }, 'Tabby Payment error:');
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getOrders = async (req, res) => {
    try {
        const userId = req.user._id;
        const ordersWithDetails = await orderService.getOrders(userId);

        res.status(200).json({
            success: true,
            message: "Orders retrieved successfully",
            data: ordersWithDetails
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching orders:");
        res.status(500).json({
            success: false,
            message: "Failed to retrieve orders",
            error: error.message
        });
    }
};

exports.initStripePayment = async (req, res) => {
    try {
        const userId = req.user._id;
        const { amountAED } = req.body;

        if (!amountAED || isNaN(amountAED) || Number(amountAED) <= 0) {
            return res.status(400).json({ error: 'amountAED is required and must be a positive number' });
        }

        const result = await orderService.initStripePayment(userId, Number(amountAED));
        return res.status(200).json(result);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('initStripePayment error:', error);
        return res.status(500).json({ error: error.message });
    }
};

exports.getPaymentMethods = async (req, res) => {
    try {
        const methods = await orderService.getPaymentMethods();
        return res.status(200).json({ methods });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

exports.paymentIntent = async (req, res) => {
    try {
        const data = await orderService.getPaymentIntent();

        res.status(200).json({
            success: true,
            message: 'Payment Intent retrieved successfully',
            data: data,
        });
    } catch (error) {
        console.error('Error fetching payment intent:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve payment intent',
            error: error.response?.data || error.message,
        });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        let filePath = null;
        if (req.file) {
            filePath = req.file.path;
        }
        const order = await orderService.updateOrderStatus(orderId, status, filePath);

        res.status(200).json({
            success: true,
            message: "Order status updated successfully",
            order
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        logger.error({ err: error }, "Update Order Status Error:");
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

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

exports.tabbyWebhook = async (req, res) => {
    try {
        const forwardedIps = (req.headers['x-forwarded-for'] || '').split(',');
        const clientIP = forwardedIps[0]?.trim() || req.socket.remoteAddress;
        const secret = req.headers['x-webhook-secret'];

        let data;
        if (Buffer.isBuffer(req.body)) {
            data = JSON.parse(req.body.toString('utf-8'));
        } else if (typeof req.body === 'object') {
            data = req.body;
        } else {
            throw new Error('Unexpected req.body type');
        }

        const result = await orderService.handleTabbyWebhook({ clientIP, secret, data });

        return res.status(200).send(result.message);
    } catch (error) {
        if (error.status === 403) {
            return res.status(403).send('Forbidden IP');
        }
        if (error.status === 401) {
            return res.status(401).send('Unauthorized');
        }
        if (error.status === 400) {
            return res.status(400).send(error.message);
        }
        if (error.status === 500) {
            return res.status(500).send(error.message);
        }
        logger.error({ err: error }, 'Tabby webhook error:');
        return res.status(500).send('Internal server error');
    }
};

exports.validateInventoryBeforeCheckout = async (req, res) => {
    try {
        const { products } = req.body;
        const user = req.user || {};
        const result = await orderService.validateInventoryBeforeCheckout(products, user, 'Mobile App Backend');

        return res.status(200).json({
            success: true,
            isValid: result.isValid,
            message: result.message,
            results: result.results
        });
    } catch (error) {
        if (error.status === 400 && error.data) {
            // Published mobile app (v1.0.23) only reads data['message'] on
            // HTTP 200 responses; non-200 falls through to a generic "Failed
            // to validate inventory" banner. Return 200 here (with isValid:
            // false) so users actually see which product is out of stock.
            return res.status(200).json(error.data);
        }
        if (error.status && error.data) {
            return res.status(error.status).json(error.data);
        }
        logger.error({ err: error }, 'Error validating inventory:');
        const user = req.user || {};
        await logActivity({
            platform: 'Mobile App Backend',
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
            platform: 'Mobile App Backend',
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
