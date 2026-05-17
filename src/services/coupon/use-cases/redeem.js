'use strict';

/**
 * redeem.js — transitions a reservation from 'reserved' to 'redeemed'.
 *
 * Called from the order-placement controller after the order is successfully persisted.
 *
 * @param {object} params
 * @param {string} params.redemption_id
 * @param {string} params.order_id
 * @param {object} params.final_cart - REQUIRED: the cart at order-placement time.
 *   The discount is re-validated against this cart before confirming the redemption.
 *   If the cart no longer meets coupon conditions (e.g. subtotal dropped below min),
 *   the redeem is aborted with { success: false, code: 'CART_CHANGED' }.
 */

const CouponRedemption = require('../../../models/CouponRedemption');
const { validate } = require('./validate');
const logger = require('../../../utilities/logger');

/**
 * Mark a reserved coupon redemption as redeemed.
 *
 * @param {object} params
 * @param {string} params.redemption_id
 * @param {string} [params.order_id]
 * @param {object} params.final_cart - cart at order-placement time (required)
 * @returns {Promise<{ success: boolean, redemption?: object, code?: string, error?: string }>}
 */
async function redeem({ redemption_id, order_id, final_cart }) {
  if (!redemption_id) {
    return { success: false, error: 'redemption_id is required.' };
  }
  if (!final_cart) {
    return { success: false, error: 'final_cart is required.' };
  }

  // Load the reservation to get coupon details for re-validation.
  const existing = await CouponRedemption.findOne({ _id: redemption_id, state: 'reserved' }).lean();
  if (!existing) {
    logger.warn({ redemption_id }, 'redeem: reservation not found or already redeemed');
    return { success: false, error: 'Reservation not found or already redeemed.' };
  }

  // Re-validate the discount against the final cart to prevent stale-cart abuse.
  const couponCode = existing.metadata && existing.metadata.reward
    ? (existing.metadata.coupon_code || null)
    : null;

  // Fetch the coupon code via the stored coupon_id for re-validation.
  const CouponV2 = require('../../../models/CouponV2');
  const coupon = await CouponV2.findById(existing.coupon_id).lean();
  if (coupon) {
    const { verdict } = await validate({
      code: coupon.code,
      phone: existing.phone_e164,
      user_id: existing.user_id || null,
      cart: final_cart,
      ctx: {},
      skipUserCapCheck: true, // existing reservation must not count against its own cap
    });

    if (!verdict.eligible) {
      logger.warn({ redemption_id, reason: verdict.reason }, 'redeem: final_cart validation failed');
      return {
        success: false,
        code: 'CART_CHANGED',
        error: 'Discount no longer applies to current cart.',
      };
    }
  }

  const redemption = await CouponRedemption.findOneAndUpdate(
    { _id: redemption_id, state: 'reserved' },
    {
      $set: {
        state: 'redeemed',
        order_id: order_id || null,
        redeemed_at: new Date(),
      },
    },
    { new: true }
  ).lean();

  if (!redemption) {
    logger.warn({ redemption_id }, 'redeem: reservation not found or already redeemed');
    return { success: false, error: 'Reservation not found or already redeemed.' };
  }

  return { success: true, redemption };
}

module.exports = { redeem };
