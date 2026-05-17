'use strict';

const logger = require('../../utilities/logger');

/**
 * v1-adapter.js — maps v2 engine results to the legacy v1 response shape.
 *
 * CRITICAL: the POST /api/check-coupon endpoint must return these exact shapes:
 *   { success: true, discountPercent: N, capAED: N|null, ...legacy }
 *   { success: true, discountAmount: N }
 *   { success: false, message: "..." }
 *
 * Adding a new reward that legacy clients can't handle should degrade gracefully
 * with message "Please update the app to use this coupon."
 *
 * Rejection messages must contain words the mobile _mapMessage() matches:
 *   expired → /expired/i
 *   already used → /already used/i
 *   minimum → /minimum/i
 *   first order → /first.order/i or /first-time/i
 *   not eligible → general message
 *   disabled → general "not active" message
 */

const REASONS = require('./domain/rejection-reasons');

/** Map from structured reason → legacy message string */
const REASON_MESSAGES = {
  [REASONS.NOT_FOUND]: 'Coupon/promo code is not valid or has already been used.',
  [REASONS.EXPIRED]: 'This coupon has expired.',
  [REASONS.NOT_STARTED]: 'This coupon is not yet active.',
  [REASONS.ALREADY_USED]: 'You have already used this coupon.',
  [REASONS.USER_CAP_REACHED]: 'You have already used this coupon.',
  [REASONS.GLOBAL_CAP_REACHED]: 'Coupon/promo code is not valid or has already been used.',
  [REASONS.BELOW_MINIMUM]: 'This coupon requires a minimum order amount.',
  [REASONS.FIRST_ORDER_ONLY]: 'This coupon is for first-time orders only.',
  [REASONS.NOT_ELIGIBLE]: 'This coupon is not applicable to your order.',
  [REASONS.DISABLED]: 'This promotion is not active.',
  [REASONS.RATE_LIMITED]: 'Too many requests. Please try again later.',
};

/**
 * Map a v2 verdict + discount to the legacy v1 response shape.
 *
 * @param {{ verdict: import('./domain/EligibilityVerdict'), discount?: import('./domain/AppliedDiscount'), coupon?: object }} result
 * @param {string} [legacyMessage] - override message for success (e.g. from checkCouponCode)
 * @returns {object} legacy response shape
 */
function toV1Response({ verdict, discount, coupon }) {
  if (!verdict.eligible) {
    const message = REASON_MESSAGES[verdict.reason] || verdict.message || 'Coupon is not valid.';
    return { success: false, message };
  }

  // Map reward type to v1 shape
  const rewardType = coupon && coupon.reward ? coupon.reward.type : (discount ? discount.type : null);

  if (rewardType === 'flat') {
    return {
      success: true,
      message: 'Coupon code is valid.',
      type: 'coupon',
      discountAmount: discount ? discount.aed : 0,
    };
  }

  if (rewardType === 'percent') {
    const percent = coupon && coupon.reward ? coupon.reward.percent : 0;
    const capAED = coupon && coupon.reward ? (coupon.reward.cap_aed ?? null) : null;
    return {
      success: true,
      message: 'Coupon code is valid.',
      type: 'coupon',
      discountPercent: percent,
      capAED,
    };
  }

  // Unknown / complex reward types — degrade gracefully for legacy clients
  logger.warn({ reward_type: rewardType, coupon_code: coupon && coupon.code }, 'v1-adapter: unmapped reward type — degrading gracefully');
  return {
    success: false,
    message: 'Please update the app to use this coupon.',
  };
}

module.exports = { toV1Response, REASON_MESSAGES };
