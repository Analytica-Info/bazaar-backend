const express = require('express');
const router = express.Router();
const publicController = require('../../controllers/mobile/publicController');
const authMiddleware = require('../../middleware/authMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx/;
const path = require("path");
const uploadPath = path.join(__dirname, "../../uploads/contact");
const upload = createUpload(allowedFileTypes, uploadPath);

router.post('/contact-us', publicController.contactUs);
router.post('/feedback', authMiddleware, publicController.submitFeedback);
router.post('/mobile-app-log', publicController.createMobileAppLog);

module.exports = router;