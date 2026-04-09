const express = require('express');
const router = express.Router();
const publicController = require('../../controllers/mobile/publicController');
const authMiddleware = require('../../middleware/authMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx/;
const path = require("path");
const uploadPath = path.join(__dirname, "../../uploads/contact");
const upload = createUpload(allowedFileTypes, uploadPath);

const shippingCtrl = require('../../controllers/ecommerce/shippingCountryController');

// Public shipping endpoints
router.get('/shipping-countries', shippingCtrl.listActive);
router.get('/shipping-countries/:code/cities', shippingCtrl.getCities);
router.get('/shipping-cost', shippingCtrl.getShippingCost);

router.post('/contact-us', publicController.contactUs);
router.post('/feedback', authMiddleware, publicController.submitFeedback);
router.post('/mobile-app-log', publicController.createMobileAppLog);

module.exports = router;