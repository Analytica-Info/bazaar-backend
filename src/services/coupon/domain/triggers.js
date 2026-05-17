'use strict';

/**
 * Coupon trigger constants for the v2 engine.
 *
 * TRIGGERS        — full enum of all supported trigger values.
 * PUBLIC_TRIGGERS — only these may be used via /validate and /apply public routes.
 *                   All other triggers are "auto" and must go through evaluateAuto
 *                   or grant.
 * isAutoTrigger   — returns true for any trigger that is not 'code'.
 */

/** @readonly @enum {string} */
const TRIGGERS = Object.freeze({
  CODE: 'code',
  CART_RENDER: 'cart_render',
  CHECKOUT_INTENT: 'checkout_intent',
  SIGNUP: 'signup',
  SCHEDULED: 'scheduled',
  MANUAL_GRANT: 'manual_grant',
});

/** @readonly {string[]} */
const PUBLIC_TRIGGERS = Object.freeze(['code']);

/**
 * Returns true if the trigger is an auto trigger (i.e. not manually entered by the user).
 *
 * @param {string} t
 * @returns {boolean}
 */
function isAutoTrigger(t) {
  return t !== 'code';
}

module.exports = { TRIGGERS, PUBLIC_TRIGGERS, isAutoTrigger };
