const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/mobile/orderController');
const authMiddleware = require('../../middleware/authMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png/;
const orderUpload = createUpload(allowedFileTypes, "uploads/orders");

router.get('/payment-intent', orderController.paymentIntent);
router.get('/get-orders', authMiddleware, orderController.getOrders);
router.post('/validate-inventory', authMiddleware, orderController.validateInventoryBeforeCheckout);
router.post('/checkout-session', authMiddleware, orderController.checkoutSession);
router.post('/checkout-session-tabby', authMiddleware, orderController.checkoutSessionTabby);
router.get('/verify-tabby-status', authMiddleware, orderController.verifyTabbyPayment);
router.get('/address', authMiddleware, orderController.address);
router.post('/address', authMiddleware, orderController.storeAddress);
router.post("/order-status/:orderId", orderUpload.single("file"), orderController.updateOrderStatus);
router.delete("/address/:addressId", authMiddleware, orderController.deleteAddress);
router.patch("/address/:addressId/set-primary", authMiddleware, orderController.setPrimaryAddress);

module.exports = router;