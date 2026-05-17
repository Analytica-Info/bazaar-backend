'use strict';

/**
 * release.js — releases a reserved coupon (restores uses_remaining).
 *
 * Called when an order is abandoned or payment fails.
 * Safe to call multiple times (idempotent).
 *
 * SECURITY: requires requesting_user_id and validates ownership before
 * transitioning state. Callers without a matching user_id receive 403.
 */

const CouponRedemption = require('../../../models/CouponRedemption');
const CouponV2 = require('../../../models/CouponV2');
const logger = require('../../../utilities/logger');

/**
 * Release a reserved coupon redemption.
 *
 * @param {object} params
 * @param {string} params.redemption_id
 * @param {string} params.requesting_user_id - must match redemption.user_id
 * @returns {Promise<{ success: boolean, already_released?: boolean, status?: number, code?: string, error?: string }>}
 */
async function release({ redemption_id, requesting_user_id }) {
  if (!redemption_id) {
    return { success: false, error: 'redemption_id is required.' };
  }

  // Load the redemption first to check ownership before mutating.
  const existing = await CouponRedemption.findById(redemption_id).lean();
  if (!existing) {
    return { success: false, error: 'Redemption not found.' };
  }

  // Ownership check: user_id on the redemption must match the caller.
  if (existing.user_id && existing.user_id !== String(requesting_user_id)) {
    logger.warn(
      { redemption_id, requesting_user_id, owner_user_id: existing.user_id },
      'release: ownership mismatch — IDOR attempt blocked'
    );
    return {
      success: false,
      status: 403,
      code: 'FORBIDDEN',
      error: 'Redemption does not belong to caller.',
    };
  }

  if (existing.state === 'released') {
    return { success: true, already_released: true };
  }

  if (existing.state !== 'reserved') {
    return { success: false, error: `Cannot release a redemption in state '${existing.state}'.` };
  }

  const redemption = await CouponRedemption.findOneAndUpdate(
    { _id: redemption_id, state: 'reserved' },
    {
      $set: {
        state: 'released',
        released_at: new Date(),
      },
    },
    { new: true }
  ).lean();

  if (!redemption) {
    // Another concurrent request transitioned the state between our read and update.
    const refetched = await CouponRedemption.findById(redemption_id).lean();
    if (refetched && refetched.state === 'released') {
      return { success: true, already_released: true };
    }
    return { success: false, error: 'Failed to release — state may have changed concurrently.' };
  }

  // Restore uses_remaining only if the coupon was use-capped at apply time.
  if (redemption.was_uses_capped) {
    try {
      await CouponV2.findByIdAndUpdate(redemption.coupon_id, { $inc: { uses_remaining: 1 } });
    } catch (err) {
      logger.error({ err, redemption_id }, 'release: failed to restore uses_remaining');
      // Don't fail the release itself — the TTL index will restore it eventually
    }
  }

  return { success: true };
}

module.exports = { release };
