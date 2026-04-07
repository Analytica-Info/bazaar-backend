const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/ecommerce/orderController');
const authMiddleware = require('../../middleware/authMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png/;
const orderUpload = createUpload(allowedFileTypes, "uploads/orders");
const proofOfDeliveryUpload = createUpload(allowedFileTypes, "uploads/proof-of-delivery");

router.get('/address', authMiddleware('user'), orderController.address);
router.post('/address', authMiddleware('user'), orderController.storeAddress);
router.delete("/address/:addressId", authMiddleware('user'), orderController.deleteAddress);
router.patch("/address/:addressId/set-primary", authMiddleware('user'), orderController.setPrimaryAddress);
router.post('/validate-inventory', authMiddleware('user'), orderController.validateInventoryBeforeCheckout);
router.post("/orders/proof-of-delivery", proofOfDeliveryUpload.array("proof_of_delivery", 10), orderController.uploadProofOfDelivery);

module.exports = router;