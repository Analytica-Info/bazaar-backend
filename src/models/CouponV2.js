'use strict';

/**
 * CouponV2 — coupons_v2 collection.
 *
 * Uses Schema.Types.Mixed for `rules` and `reward` subdocs so the registry
 * pattern stays open/closed: adding a new predicate or reward type requires
 * zero schema changes. Validation is owned by the predicate/reward classes
 * themselves, not by Mongoose validators.
 */
const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    // Mixed payload — each predicate class defines its own fields
  },
  { strict: false, _id: false }
);

const rewardSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    // Mixed payload — each reward class defines its own fields
  },
  { strict: false, _id: false }
);

const couponV2Schema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true },
    title: { type: String },
    description: { type: String },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'expired'],
      default: 'draft',
    },
    starts_at: { type: Date },
    ends_at: { type: Date },
    max_uses_total: { type: Number, default: null }, // null = unlimited
    uses_remaining: { type: Number, default: null },
    max_uses_user: { type: Number, default: 1 },
    rules: { type: [ruleSchema], default: [] },
    reward: { type: rewardSchema, required: true },
    priority: { type: Number, default: 0 },
    trigger: {
      type: String,
      enum: ['code', 'cart_render', 'checkout_intent', 'signup', 'scheduled', 'manual_grant'],
      required: true,
      default: 'code',
      index: true,
    },
    stack_group: { type: String, default: null, index: true },
    stackable: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    rule_version: { type: Number, default: 1 },
    created_by: { type: String },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'coupons_v2',
  }
);

// Compound index for active-window scan (eligible endpoint)
couponV2Schema.index({ status: 1, starts_at: 1, ends_at: 1 });
// Hot-path index for candidateRepository trigger queries
couponV2Schema.index({ status: 1, trigger: 1, priority: -1, starts_at: 1, ends_at: 1 });
couponV2Schema.index({ priority: -1 });

const CouponV2 = mongoose.model('CouponV2', couponV2Schema);
module.exports = CouponV2;
