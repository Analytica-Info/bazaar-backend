'use strict';

/**
 * candidateRepository — single query layer for active CouponV2 candidates.
 *
 * Uses the composite index { status, trigger, priority, starts_at, ends_at }
 * so both bounds are optional on each document.
 */

const CouponV2 = require('../../../models/CouponV2');

/**
 * Find active coupons for a given trigger within the current time window.
 * Either bound (starts_at / ends_at) may be absent on the document.
 *
 * @param {string} trigger
 * @param {{ now?: Date, limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
async function findActiveByTrigger(trigger, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const limit = typeof opts.limit === 'number' ? opts.limit : 100;

  return CouponV2.find({
    status: 'active',
    trigger,
    $or: [{ starts_at: null }, { starts_at: { $lte: now } }],
    $and: [
      { $or: [{ ends_at: null }, { ends_at: { $gte: now } }] },
    ],
  })
    .sort({ priority: -1, _id: 1 })
    .limit(limit)
    .lean();
}

/**
 * Find a coupon by its exact code (case-insensitive, trimmed).
 *
 * @param {string} code
 * @returns {Promise<object|null>}
 */
async function findByCode(code) {
  return CouponV2.findOne({ code: String(code).toLowerCase().trim() }).lean();
}

module.exports = { findActiveByTrigger, findByCode };
