'use strict';

/**
 * apply.js — atomically reserves a coupon for a cart/order.
 *
 * Flow:
 *   1. validate() — pure check, returns discount + coupon doc
 *   2. Idempotency check — if idempotency_key already exists, return that record
 *   3. findOneAndUpdate with conditional $inc on uses_remaining (atomic decrement)
 *   4. Insert CouponRedemption with state = 'reserved', expires_at = now + 30min
 *   5. If insert fails (duplicate per-user constraint), roll back the decrement
 *
 * Reservation TTL: 30 minutes. The MongoDB TTL index auto-releases orphaned reservations.
 */

const CouponV2 = require('../../../models/CouponV2');
const CouponRedemption = require('../../../models/CouponRedemption');
const { validate } = require('./validate');
const { serializeReward } = require('../wire/serializeReward');
const REASONS = require('../domain/rejection-reasons');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const logger = require('../../../utilities/logger');

const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Apply (reserve) a coupon.
 *
 * @param {object} params
 * @param {string} params.code
 * @param {string} params.phone - E.164 phone number (required)
 * @param {string} [params.user_id]
 * @param {object} [params.cart]
 * @param {object} [params.ctx]
 * @param {string} [params.idempotency_key]
 * @returns {Promise<{ redemption_id: string, discount_aed: number, reward: object, expires_at: Date } | { error: { reason: string, message: string } }>}
 */
async function apply({ code, phone, user_id, cart = {}, ctx = {}, idempotency_key }) {
  if (!phone) {
    return { error: { reason: REASONS.NOT_ELIGIBLE, message: 'Phone number is required.' } };
  }

  // Idempotency check: return existing reservation if key already used.
  // Prefer the pre-serialized wire shape stored at insert time. Fall back to
  // serializing `metadata.discount` when wire_reward is absent (TTL means any
  // pre-migration rows age out within RESERVATION_TTL_MS — no backfill needed).
  if (idempotency_key) {
    const existing = await CouponRedemption.findOne({ idempotency_key }).lean();
    if (existing) {
      return {
        redemption_id: existing._id.toString(),
        discount_aed: existing.discount_aed,
        reward: existing.metadata?.wire_reward
          || serializeReward(existing.metadata?.discount)
          || null,
        expires_at: existing.expires_at,
      };
    }
  }

  // Validate
  const { verdict, discount, coupon } = await validate({ code, phone, user_id, cart, ctx });
  if (!verdict.eligible) {
    return { error: { reason: verdict.reason, message: verdict.message } };
  }

  // Per-user cap: check active reservations/redemptions
  const activeCount = await CouponRedemption.countDocuments({
    coupon_id: coupon._id,
    phone_e164: phone,
    state: { $in: ['reserved', 'redeemed'] },
  });
  if (activeCount >= (coupon.max_uses_user || 1)) {
    return {
      error: {
        reason: REASONS.USER_CAP_REACHED,
        message: 'You have already used this coupon.',
      },
    };
  }

  // Atomic decrement of uses_remaining (only if > 0 or null/unlimited)
  let updatedCoupon;
  if (coupon.uses_remaining !== null) {
    updatedCoupon = await CouponV2.findOneAndUpdate(
      { _id: coupon._id, uses_remaining: { $gt: 0 } },
      { $inc: { uses_remaining: -1 } },
      { new: true }
    );
    if (!updatedCoupon) {
      return {
        error: { reason: REASONS.GLOBAL_CAP_REACHED, message: 'This coupon has reached its usage limit.' },
      };
    }
  }

  const now = new Date();
  const expires_at = new Date(now.getTime() + RESERVATION_TTL_MS);
  const was_uses_capped = coupon.uses_remaining !== null;

  // Insert reservation
  let redemption;
  try {
    redemption = await CouponRedemption.create({
      coupon_id: coupon._id,
      user_id: user_id || null,
      phone_e164: phone,
      state: 'reserved',
      discount_aed: discount.aed,
      rule_version: coupon.rule_version,
      idempotency_key: idempotency_key || null,
      was_uses_capped,
      applied_at: now,
      expires_at,
      metadata: {
        cart_snapshot: cart,
        // `reward` (raw Mongo config) kept for back-compat with anything that reads it.
        // `wire_reward` is the public v2 wire shape — serve this on idempotent replay.
        reward: coupon.reward,
        wire_reward: serializeReward(discount),
        discount,
      },
    });
  } catch (err) {
    // Roll back the decrement if insert failed
    if (was_uses_capped && updatedCoupon) {
      await CouponV2.findByIdAndUpdate(coupon._id, { $inc: { uses_remaining: 1 } });
    }

    if (err.code === 11000) {
      // Duplicate idempotency key race: re-fetch and return existing record.
      if (idempotency_key) {
        const existing = await CouponRedemption.findOne({ idempotency_key }).lean();
        if (existing) {
          return {
            redemption_id: existing._id.toString(),
            discount_aed: existing.discount_aed,
            reward: existing.metadata?.wire_reward
              || serializeReward(existing.metadata?.discount)
              || null,
            expires_at: existing.expires_at,
          };
        }
      }
      // Duplicate per-user/coupon partial-unique index: already reserved
      return {
        error: {
          reason: REASONS.USER_CAP_REACHED,
          message: 'You have already reserved this coupon.',
          code: 'ALREADY_RESERVED',
        },
      };
    }

    logger.error({ err }, 'apply: failed to insert CouponRedemption');
    throw err;
  }

  return {
    redemption_id: redemption._id.toString(),
    discount_aed: discount.aed,
    reward: serializeReward(discount),
    expires_at,
  };
}

module.exports = { apply };
