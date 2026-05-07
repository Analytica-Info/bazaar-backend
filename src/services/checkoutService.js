'use strict';

/**
 * checkoutService.js — thin facade (PR-MOD-4).
 *
 * All 8 exports are re-delegated to per-use-case modules under ./checkout/.
 * Controllers continue to require this path unchanged.
 * No behavior is modified; this is a structural split only.
 *
 * Layout:
 *   src/services/checkout/use-cases/  — one file per exported function
 *   src/services/checkout/domain/     — pure helpers (discount, cart)
 *   src/services/checkout/shared/     — inventory helpers (checkout variant, BUG-029)
 *   src/services/checkout/index.js    — barrel
 */

const checkout = require('./checkout');

exports.createStripeCheckout = checkout.createStripeCheckout;
exports.verifyStripePayment  = checkout.verifyStripePayment;
exports.createTabbyCheckout  = checkout.createTabbyCheckout;
exports.verifyTabbyPayment   = checkout.verifyTabbyPayment;
exports.handleTabbyWebhook   = checkout.handleTabbyWebhook;
exports.createNomodCheckout  = checkout.createNomodCheckout;
exports.verifyNomodPayment   = checkout.verifyNomodPayment;
exports.processCheckout      = checkout.processCheckout;
