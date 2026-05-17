'use strict';
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
router.post('/auth/login/google', authCtrl.loginGoogle);
router.post('/auth/login/apple', authCtrl.loginApple);
router.post('/auth/logout', authCtrl.logout);
router.get('/auth/session', authCtrl.getSession);
router.post('/auth/password/forgot', authCtrl.passwordForgot);
router.post('/auth/password/verify-code', authCtrl.passwordVerifyCode);
router.post('/auth/password/reset', authCtrl.passwordReset);
router.patch('/me/password', auth.required(), authCtrl.updatePassword);
router.patch('/me', auth.required(), avatarUpload.single('file'), authCtrl.updateMe);
router.get('/me', auth.required(), authCtrl.getMe);
router.delete('/me', auth.required(), authCtrl.deleteMe);
router.post('/auth/recovery/verify', authCtrl.verifyRecovery);
router.post('/auth/recovery/resend', authCtrl.resendRecovery);

// ── Me / User ─────────────────────────────────────────────────────
router.get('/me/dashboard', auth.required(), userCtrl.getDashboard);
router.get('/me/reviews', auth.required(), userCtrl.getReviews);
// Review creation is canonically nested under products: POST /products/:id/reviews
// (shared/reviewController.submitProductReview). The user-side POST /me/reviews was a
// duplicate calling the same service method and is intentionally NOT mounted here.
router.get('/me/dashboard/current-month-categories', auth.required(), userCtrl.getCurrentMonthCategories);
router.get('/me/payments', auth.required(), userCtrl.getPaymentHistory);
router.get('/me/payments/:id', auth.required(), userCtrl.getSinglePaymentHistory);

// ── Addresses (relocated from /orders/address) ────────────────────
// Specific paths MUST come before parameterised /:id
router.get('/me/addresses', auth.required(), orderCtrl.listAddresses);
router.post('/me/addresses', auth.required(), orderCtrl.createAddress);
router.delete('/me/addresses/:id', auth.required(), orderCtrl.deleteAddress);
router.patch('/me/addresses/:id', auth.required(), orderCtrl.updateAddress);

// ── Orders ────────────────────────────────────────────────────────
// Specific paths MUST come before parameterised /:id
router.post('/orders/inventory-checks', auth.required(), orderCtrl.createInventoryCheck);
router.post('/orders/checkouts/nomod', auth.required(), orderCtrl.createNomodCheckout);
router.post('/orders/checkouts/nomod/verify', auth.required(), orderCtrl.verifyNomodCheckout);
router.get('/orders', auth.required(), userCtrl.getOrders);
router.get('/orders/:id', auth.required(), userCtrl.getOrder);

// ── Cart ──────────────────────────────────────────────────────────
// Specific paths MUST come before parameterised /:productId
router.get('/cart', auth.required(), cartCtrl.getCart);
router.post('/cart/items', auth.required(), cartCtrl.addItem);
router.delete('/cart/items/:productId', auth.required(), cartCtrl.removeItem);
router.patch('/cart/items/:productId', auth.required(), cartCtrl.updateItemQuantity);

// ── Notifications ─────────────────────────────────────────────────
router.get('/notifications', auth.required(), notifCtrl.getNotifications);
router.patch('/notifications', auth.required(), notifCtrl.updateReadState);

module.exports = router;
