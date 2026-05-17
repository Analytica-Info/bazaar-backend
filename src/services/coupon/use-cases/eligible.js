'use strict';

/**
 * eligible.js — returns coupons the current cart qualifies for.
 *
 * Sorted by priority desc, then discount desc. Capped to top 10.
 * Excludes coupons already redeemed by the user.
 */

const CouponRedemption = require('../../../models/CouponRedemption');
const { validate } = require('./validate');
const { serializeReward } = require('../wire/serializeReward');
const logger = require('../../../utilities/logger');
const candidateRepository = require('../infrastructure/candidateRepository');

const MAX_ELIGIBLE = 10;

/**
 * Get eligible coupons for a cart context.
 *
 * @param {object} params
 * @param {string} [params.phone]
 * @param {string} [params.user_id]
 * @param {object} [params.cart] - { subtotal, items, shipping_cost, vertical, ... }
 * @param {object} [params.ctx] - extra predicate context
 * @returns {Promise<Array<{ coupon: object, discount_aed: number }>>}
 */
async function eligible({ phone, user_id, cart = {}, ctx = {} }) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();

  // Fetch all potentially active code-triggered coupons via the candidate repository
  const candidates = await candidateRepository.findActiveByTrigger('code', { now, limit: 50 });

  // Exclude already redeemed by this user
  let excludeIds = new Set();
  if (phone || user_id) {
    const phoneFilter = phone ? { phone_e164: phone } : {};
    const userFilter = user_id ? { user_id } : {};
    const used = await CouponRedemption.find({
      ...phoneFilter,
      ...userFilter,
      state: { $in: ['reserved', 'redeemed'] },
    })
      .select('coupon_id')
      .lean();
    excludeIds = new Set(used.map((r) => r.coupon_id.toString()));
  }

  const results = [];

  for (const coupon of candidates) {
    if (excludeIds.has(coupon._id.toString())) continue;

    try {
      const { verdict, discount } = await validate({
        code: coupon.code,
        phone,
        user_id,
        cart,
        ctx: { ...ctx, now },
      });

      if (verdict.eligible && discount) {
        results.push({
          coupon: {
            _id: coupon._id,
            code: coupon.code,
            name: coupon.name,
            title: coupon.title,
            description: coupon.description,
            priority: coupon.priority,
            reward: serializeReward(discount),
          },
          discount_aed: discount.aed,
        });
      }
    } catch (err) {
      logger.warn({ err, coupon_code: coupon.code }, 'eligible: error validating candidate');
    }

    if (results.length >= MAX_ELIGIBLE) break;
  }

  // Sort: priority desc, discount_aed desc
  results.sort((a, b) => {
    if (b.coupon.priority !== a.coupon.priority) return b.coupon.priority - a.coupon.priority;
    return b.discount_aed - a.discount_aed;
  });

  return results.slice(0, MAX_ELIGIBLE);
}

module.exports = { eligible };
