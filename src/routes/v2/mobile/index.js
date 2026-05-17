'use strict';
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
const configCtrl = require('../../../controllers/v2/mobile/configController');

const avatarUpload = createUpload(/jpeg|jpg|png|pdf/, 'uploads/users');
const orderUpload = createUpload(/jpeg|jpg|png/, 'uploads/orders');

// ── Auth ──────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.register);
router.post('/auth/login', authCtrl.login);
router.post('/auth/login/google', authCtrl.loginGoogle);
router.post('/auth/login/apple', authCtrl.loginApple);
router.post('/auth/password/forgot', authCtrl.passwordForgot);
router.post('/auth/password/verify-code', authCtrl.passwordVerifyCode);
router.post('/auth/password/reset', authCtrl.passwordReset);
router.post('/auth/refresh', authCtrl.refresh);
router.get('/auth/session', authCtrl.getSession);
router.post('/auth/recovery/verify', authCtrl.verifyRecovery);
router.post('/auth/recovery/resend', authCtrl.resendRecovery);
router.patch('/me/password', auth.required(), authCtrl.updatePassword);
router.patch('/me', auth.required(), avatarUpload.single('file'), authCtrl.updateMe);
router.get('/me', auth.required(), authCtrl.getMe);
router.delete('/me', auth.required(), authCtrl.deleteMe);

// ── Me / User ─────────────────────────────────────────────────────
router.get('/me/payments', auth.required(), userCtrl.getPaymentHistory);
router.get('/me/payments/:id', auth.required(), userCtrl.getSinglePaymentHistory);
router.get('/me/dashboard', auth.required(), userCtrl.getDashboard);
router.get('/me/reviews', auth.required(), userCtrl.getReviews);
router.get('/me/payments/tabby/history', auth.required(), userCtrl.getTabbyBuyerHistory);

// ── Addresses (relocated from /orders/address) ────────────────────
// Specific paths MUST come before parameterised /:id
router.get('/me/addresses', auth.required(), orderCtrl.listAddresses);
router.post('/me/addresses', auth.required(), orderCtrl.createAddress);
router.delete('/me/addresses/:id', auth.required(), orderCtrl.deleteAddress);
router.patch('/me/addresses/:id', auth.required(), orderCtrl.updateAddress);

// ── Payment methods (top-level, not order-scoped) ─────────────────
router.get('/payment-methods', auth.required(), orderCtrl.listPaymentMethods);

// ── Orders ────────────────────────────────────────────────────────
// Specific paths MUST come before parameterised /:id
router.get('/orders', auth.required(), orderCtrl.getOrders);
router.post('/orders/inventory-checks', auth.required(), orderCtrl.createInventoryCheck);
router.post('/orders/checkouts/stripe', auth.required(), orderCtrl.createStripeCheckout);
router.post('/orders/checkouts/tabby', auth.required(), orderCtrl.createTabbyCheckout);
router.post('/orders/checkouts/tabby/verify', auth.required(), orderCtrl.verifyTabbyCheckout);
router.post('/orders/checkouts/nomod', auth.required(), orderCtrl.createNomodCheckout);
router.post('/orders/checkouts/nomod/verify', auth.required(), orderCtrl.verifyNomodCheckout);
router.post('/orders/checkouts/stripe/init', auth.required(), orderCtrl.initStripeCheckout);
// Proof-of-delivery: file upload route (separate from status-only PATCH)
router.post('/orders/:id/proof-of-delivery', auth.required(), orderUpload.single('file'), orderCtrl.uploadProofOfDelivery);
// Status-only update (no file)
router.patch('/orders/:id', auth.required(), orderCtrl.updateOrderStatus);

// ── Cart ──────────────────────────────────────────────────────────
// Specific paths MUST come before parameterised /:productId
router.get('/cart', auth.required(), cartCtrl.getCart);
router.post('/cart/items', auth.required(), cartCtrl.addItem);
router.delete('/cart/items/:productId', auth.required(), cartCtrl.removeItem);
router.patch('/cart/items/:productId', auth.required(), cartCtrl.updateItemQuantity);

// ── Notifications ─────────────────────────────────────────────────
router.get('/notifications', auth.required(), notifCtrl.getNotifications);
router.patch('/notifications', auth.required(), notifCtrl.updateReadState);
router.post('/notifications/:id/clicks', auth.required(), notifCtrl.recordClick);

// ── Config ────────────────────────────────────────────────────────
router.get('/config', configCtrl.getConfig);

module.exports = router;
