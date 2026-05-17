'use strict';

/**
 * CouponRedemption — coupon_redemptions collection.
 *
 * Lifecycle: reserved → redeemed | released | refunded
 * TTL index on expires_at auto-deletes orphaned reservations.
 */
const mongoose = require('mongoose');

const couponRedemptionSchema = new mongoose.Schema(
  {
    coupon_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CouponV2',
      required: true,
    },
    user_id: { type: String, default: null }, // nullable for guests
    order_id: { type: String, default: null }, // nullable until order placed
    phone_e164: { type: String, required: true },
    state: {
      type: String,
      enum: ['reserved', 'redeemed', 'released', 'refunded'],
      default: 'reserved',
    },
    discount_aed: { type: Number, required: true },
    rule_version: { type: Number, required: true },
    idempotency_key: { type: String, default: null },
    was_uses_capped: { type: Boolean, default: false }, // true when coupon.uses_remaining !== null at apply time
    applied_at: { type: Date, default: Date.now },
    redeemed_at: { type: Date, default: null },
    released_at: { type: Date, default: null },
    expires_at: { type: Date, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // cart snapshot
  },
  {
    timestamps: false,
    collection: 'coupon_redemptions',
  }
);

// TTL index — MongoDB auto-deletes reserved-but-abandoned redemptions
couponRedemptionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Query indexes
couponRedemptionSchema.index({ coupon_id: 1, user_id: 1, state: 1 });

// Idempotency key — unique + partialFilterExpression so null values are excluded.
// sparse:true alone excludes documents missing the field, but Mongoose sets the field
// to null explicitly, which breaks sparse. partialFilterExpression is the safe approach.
couponRedemptionSchema.index(
  { idempotency_key: 1 },
  { unique: true, partialFilterExpression: { idempotency_key: { $type: 'string' } } }
);

// Partial unique index — prevents concurrent double-reservation per user per coupon.
// Only one active (reserved|redeemed) record may exist for a given (coupon, phone) pair.
couponRedemptionSchema.index(
  { coupon_id: 1, phone_e164: 1 },
  { unique: true, partialFilterExpression: { state: { $in: ['reserved', 'redeemed'] } } }
);

// Supporting index for state-scoped queries
couponRedemptionSchema.index({ coupon_id: 1, phone_e164: 1, state: 1 });

const CouponRedemption = mongoose.model(
  'CouponRedemption',
  couponRedemptionSchema
);
module.exports = CouponRedemption;
