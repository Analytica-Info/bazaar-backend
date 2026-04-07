const express = require('express');
const { register, login, forgotPassword, verifyCode, resetPassword, 
        updatePassword, googleLogin, appleLogin, userUpdate, appleCallback, deleteAccount, 
        verifyRecoveryCode, resendRecoveryCode, getNotification, markNotificationsAsRead,  
        review, orders, order, paymentHistory, singlePaymentHistory, dashboard,
        currentMonthOrderCategories, addReview
    } = require('../../controllers/ecommerce/userController');
const authMiddleware = require('../../middleware/authMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png|pdf/;
const upload = createUpload(allowedFileTypes, "uploads/users");

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-code', verifyCode);
router.post('/reset-password',  resetPassword);
router.put('/update-password', authMiddleware('user'), updatePassword);
router.post('/google-login', googleLogin);
router.post('/apple-login', appleLogin);
router.post('/apple-call-back', appleCallback);
router.post('/user-update', authMiddleware('user'), upload.single('file'), userUpdate);
router.get('/delete-account', authMiddleware('user'), deleteAccount);
router.post('/recovery-account', verifyRecoveryCode);
router.post('/resend-recovery-code', resendRecoveryCode);
router.get('/get-notification', authMiddleware('user'), getNotification);
router.post('/mark-read', authMiddleware('user'), markNotificationsAsRead);
router.get('/user-review', authMiddleware('user'), review);
router.get('/user-orders', authMiddleware('user'), orders);
router.get('/user-order/:id', authMiddleware('user'), order);
router.get('/user-payment-history', authMiddleware('user'), paymentHistory);
router.get('/user-dashboard', authMiddleware('user'), dashboard);
router.get('/user-single-payment-history/:id', authMiddleware('user'), singlePaymentHistory);
router.get('/current-month-order-categories', authMiddleware('user'), currentMonthOrderCategories);
router.post('/add-review', authMiddleware('user'), upload.single('file'), addReview);
module.exports =  router;