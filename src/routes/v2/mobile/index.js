/**
 * V2 Mobile routes
 * All routes here are specific to the mobile BFF (Flutter app).
 */
const express = require('express');
const router = express.Router();
const auth = require('../../../middleware/authV2');
const createUpload = require('../../../utilities/fileUpload');

const authCtrl = require('../../../controllers/v2/mobile/authController');
const userCtrl = require('../../../controllers/v2/mobile/userController');
const orderCtrl = require('../../../controllers/v2/mobile/orderController');
const cartCtrl = require('../../../controllers/v2/mobile/cartController');
const notifCtrl = require('../../../controllers/v2/mobile/notificationController');

const avatarUpload = createUpload(/jpeg|jpg|png|pdf/, 'uploads/users');
const orderUpload = createUpload(/jpeg|jpg|png/, 'uploads/orders');

// ── Auth ──────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/google-login', authCtrl.googleLogin);
router.post('/auth/apple-login', authCtrl.appleLogin);
router.post('/auth/forgot-password', authCtrl.forgotPassword);
router.post('/auth/verify-code', authCtrl.verifyCode);
router.post('/auth/reset-password', authCtrl.resetPassword);
router.post('/auth/refresh-token', authCtrl.refreshToken);
router.post('/auth/check-access-token', authCtrl.checkAccessToken);
router.post('/auth/recovery-account', authCtrl.verifyRecoveryCode);
router.post('/auth/resend-recovery-code', authCtrl.resendRecoveryCode);
router.put('/auth/update-password', auth.required(), authCtrl.updatePassword);
router.post('/auth/update-profile', auth.required(), avatarUpload.single('file'), authCtrl.updateProfile);
router.get('/auth/user-data', auth.required(), authCtrl.getUserData);
router.delete('/auth/account', auth.required(), authCtrl.deleteAccount);

// ── User ──────────────────────────────────────────────────────────
router.get('/user/profile', auth.required(), userCtrl.getProfile);
router.get('/user/orders', auth.required(), userCtrl.getOrders);
router.get('/user/orders/:id', auth.required(), userCtrl.getOrder);
router.get('/user/payment-history', auth.required(), userCtrl.getPaymentHistory);
router.get('/user/payment-history/:id', auth.required(), userCtrl.getSinglePaymentHistory);
router.get('/user/dashboard', auth.required(), userCtrl.getDashboard);
router.get('/user/reviews', auth.required(), userCtrl.getReviews);
router.get('/user/tabby-buyer-history', auth.required(), userCtrl.getTabbyBuyerHistory);

// ── Orders ────────────────────────────────────────────────────────
router.get('/orders', auth.required(), orderCtrl.getOrders);
router.post('/orders/validate-inventory', auth.required(), orderCtrl.validateInventory);
router.post('/orders/checkout/stripe', auth.required(), orderCtrl.checkoutStripe);
router.post('/orders/checkout/tabby', auth.required(), orderCtrl.checkoutTabby);
router.get('/orders/verify/tabby', auth.required(), orderCtrl.verifyTabby);
router.post('/orders/checkout/nomod', auth.required(), orderCtrl.checkoutNomod);
router.get('/orders/verify/nomod', auth.required(), orderCtrl.verifyNomod);
router.post('/orders/stripe/init', auth.required(), orderCtrl.initStripePayment);
router.get('/orders/payment-methods', auth.required(), orderCtrl.getPaymentMethods);
router.get('/orders/address', auth.required(), orderCtrl.getAddress);
router.post('/orders/address', auth.required(), orderCtrl.storeAddress);
router.delete('/orders/address/:addressId', auth.required(), orderCtrl.deleteAddress);
router.patch('/orders/address/:addressId/set-primary', auth.required(), orderCtrl.setPrimaryAddress);
router.patch('/orders/:orderId/status', auth.required(), orderUpload.single('file'), orderCtrl.updateOrderStatus);

// ── Cart ──────────────────────────────────────────────────────────
router.get('/cart', auth.required(), cartCtrl.getCart);
router.post('/cart', auth.required(), cartCtrl.addToCart);
router.delete('/cart', auth.required(), cartCtrl.removeFromCart);
router.post('/cart/increase', auth.required(), cartCtrl.increaseQty);
router.post('/cart/decrease', auth.required(), cartCtrl.decreaseQty);

// ── Notifications ─────────────────────────────────────────────────
router.get('/notifications', auth.required(), notifCtrl.getNotifications);
router.post('/notifications/mark-read', auth.required(), notifCtrl.markRead);
router.post('/notifications/track-click', auth.required(), notifCtrl.trackClick);

module.exports = router;
