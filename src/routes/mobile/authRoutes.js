const express = require('express');
const router = express.Router();
const authController = require('../../controllers/mobile/authController');
const authMiddleware = require('../../middleware/authMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png|pdf/;
const upload = createUpload(allowedFileTypes, "uploads/users");

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/user-data', authMiddleware, authController.getUserData);
router.post('/google-login', authController.googleLogin);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-code', authController.verifyCode);
router.post('/reset-password', authController.resetPassword);
router.post('/refresh-token', authController.refreshToken);
router.post('/check-access-token', authController.checkAccessToken);
router.put('/update-password', authController.updatePassword);
router.post('/user/update', authMiddleware, upload.single('file'), authController.userUpdate);
router.post('/user/customerId', authMiddleware, authController.customerID);
router.get('/user/customerId', authMiddleware, authController.getCustomerID);
router.get('/delete-account', authMiddleware, authController.deleteAccount);
router.get('/payment-history', authMiddleware, authController.getPaymentHistory);
router.post('/recovery-account', authController.verifyRecoveryCode);
router.post('/resend-recovery-code', authController.resendRecoveryCode);
router.post('/apple-login', authController.appleLogin);
router.get('/apple-callback', authController.appleCallback);

module.exports = router;