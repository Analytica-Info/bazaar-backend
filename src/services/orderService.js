'use strict';

/**
 * orderService — thin facade.
 *
 * All 18 exports are re-delegated to per-use-case modules under ./order/.
 * Controllers (ecommerce, mobile, v2/web, v2/mobile) continue to require this
 * path unchanged.  No behavior is modified; this is a structural split only.
 *
 * Layout:
 *   src/services/order/use-cases/  — one file per exported function
 *   src/services/order/domain/     — pure helpers (cart, email templates)
 *   src/services/order/adapters/   — external API clients (lightspeed, pendingPayment)
 *   src/services/order/shared/     — quantities helpers shared with checkoutService (PR-MOD-3 will dedupe)
 */

const order = require('./order');

exports.getAddresses                   = order.getAddresses;
exports.storeAddress                   = order.storeAddress;
exports.deleteAddress                  = order.deleteAddress;
exports.setPrimaryAddress              = order.setPrimaryAddress;
exports.validateInventoryBeforeCheckout = order.validateInventoryBeforeCheckout;
exports.getOrders                      = order.getOrders;
exports.initStripePayment              = order.initStripePayment;
exports.getPaymentMethods              = order.getPaymentMethods;
exports.getPaymentIntent               = order.getPaymentIntent;
exports.updateOrderStatus              = order.updateOrderStatus;
exports.uploadProofOfDelivery          = order.uploadProofOfDelivery;
exports.markCouponUsed                 = order.markCouponUsed;
exports.createStripeCheckoutSession    = order.createStripeCheckoutSession;
exports.createTabbyCheckoutSession     = order.createTabbyCheckoutSession;
exports.verifyTabbyPayment             = order.verifyTabbyPayment;
exports.createNomodCheckoutSession     = order.createNomodCheckoutSession;
exports.verifyNomodPayment             = order.verifyNomodPayment;
exports.handleTabbyWebhook             = order.handleTabbyWebhook;
