/**
 * V2 Web routes
 * All routes here are specific to the web BFF (Next.js storefront / dashboard).
 */
const express = require('express');
const router = express.Router();
const auth = require('../../../middleware/authV2');
const createUpload = require('../../../utilities/fileUpload');

const authCtrl = require('../../../controllers/v2/web/authController');
const userCtrl = require('../../../controllers/v2/web/userController');
const orderCtrl = require('../../../controllers/v2/web/orderController');
const cartCtrl = require('../../../controllers/v2/web/cartController');
const notifCtrl = require('../../../controllers/v2/web/notificationController');

const avatarUpload = createUpload(/jpeg|jpg|png|pdf/, 'uploads/users');

// ── Auth ──────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/google-login', authCtrl.googleLogin);
router.post('/auth/apple-login', authCtrl.appleLogin);
router.post('/auth/logout', authCtrl.logout);
router.get('/auth/check', authCtrl.checkAuth);
router.post('/auth/forgot-password', authCtrl.forgotPassword);
router.post('/auth/verify-code', authCtrl.verifyCode);
router.post('/auth/reset-password', authCtrl.resetPassword);
router.put('/auth/update-password', auth.required(), authCtrl.updatePassword);
router.post('/auth/update-profile', auth.required(), avatarUpload.single('file'), authCtrl.updateProfile);
router.get('/auth/user-data', auth.required(), authCtrl.getUserData);
router.delete('/auth/account', auth.required(), authCtrl.deleteAccount);
router.post('/auth/recovery-account', authCtrl.verifyRecoveryCode);
router.post('/auth/resend-recovery-code', authCtrl.resendRecoveryCode);

// ── User ──────────────────────────────────────────────────────────
router.get('/user/profile', auth.required(), userCtrl.getProfile);
router.get('/user/orders', auth.required(), userCtrl.getOrders);
router.get('/user/orders/:id', auth.required(), userCtrl.getOrder);
router.get('/user/payment-history', auth.required(), userCtrl.getPaymentHistory);
router.get('/user/payment-history/:id', auth.required(), userCtrl.getSinglePaymentHistory);
router.get('/user/dashboard', auth.required(), userCtrl.getDashboard);
router.get('/user/reviews', auth.required(), userCtrl.getReviews);
router.get('/user/current-month-categories', auth.required(), userCtrl.getCurrentMonthCategories);
router.post('/user/reviews', auth.required(), avatarUpload.single('file'), userCtrl.addReview);

// ── Orders ────────────────────────────────────────────────────────
router.get('/orders/address', auth.required(), orderCtrl.getAddress);
router.post('/orders/address', auth.required(), orderCtrl.storeAddress);
router.delete('/orders/address/:addressId', auth.required(), orderCtrl.deleteAddress);
router.patch('/orders/address/:addressId/set-primary', auth.required(), orderCtrl.setPrimaryAddress);
router.post('/orders/validate-inventory', auth.required(), orderCtrl.validateInventory);

// ── Cart ──────────────────────────────────────────────────────────
router.get('/cart', auth.required(), cartCtrl.getCart);
router.post('/cart', auth.required(), cartCtrl.addToCart);
router.delete('/cart', auth.required(), cartCtrl.removeFromCart);
router.post('/cart/increase', auth.required(), cartCtrl.increaseQty);
router.post('/cart/decrease', auth.required(), cartCtrl.decreaseQty);

// ── Notifications ─────────────────────────────────────────────────
router.get('/notifications', auth.required(), notifCtrl.getNotifications);
router.post('/notifications/mark-read', auth.required(), notifCtrl.markRead);

module.exports = router;
