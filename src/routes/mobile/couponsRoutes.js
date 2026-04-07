const express = require('express');
const router = express.Router();
const authController = require('../../controllers/mobile/authController');
const authMiddleware = require('../../middleware/authMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png|pdf/;
const upload = createUpload(allowedFileTypes, "uploads/users");

router.get('/coupon', authMiddleware, authController.coupons);
router.post('/create-coupon', authMiddleware, authController.createCoupon);
router.post('/check-coupon',authController.checkCouponCode)

module.exports = router;