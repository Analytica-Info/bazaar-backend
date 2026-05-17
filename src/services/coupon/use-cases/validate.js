'use strict';

/**
 * validate.js — pure validation use case for the v2 coupon engine.
 *
 * Does NOT write to the database. Returns an EligibilityVerdict + AppliedDiscount.
 * Called by apply.js and the v2 validate endpoint.
 */

const CouponV2 = require('../../../models/CouponV2');
const CouponRedemption = require('../../../models/CouponRedemption');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const AppliedDiscount = require('../domain/AppliedDiscount');
const REASONS = require('../domain/rejection-reasons');
const predicateRegistry = require('../predicates/index');
const rewardRegistry = require('../rewards/index');
const logger = require('../../../utilities/logger');

/**
 * Validate a coupon code against a cart context.
 *
 * @param {object} params
 * @param {string} params.code - coupon code (case-insensitive)
 * @param {string} [params.phone] - user phone in E.164 format
 * @param {string} [params.user_id] - internal user ID
 * @param {object} [params.cart] - cart snapshot { subtotal, items, shipping_cost, ... }
 * @param {object} [params.ctx] - extra context { user_segment, vertical, ... }
 * @param {boolean} [params.skipUserCapCheck] - set true when re-validating an existing reservation
 *   (e.g. at redeem time) to avoid counting the reservation itself as a cap violation.
 * @returns {Promise<{ verdict: EligibilityVerdict, discount?: AppliedDiscount, coupon?: object }>}
 */
async function validate({ code, phone, user_id, cart = {}, ctx = {}, skipUserCapCheck = false }) {
  if (!code) {
    return {
      verdict: EligibilityVerdict.fail(REASONS.NOT_FOUND, 'Coupon code is required.'),
    };
  }

  let coupon;
  try {
    coupon = await CouponV2.findOne({ code: String(code).toLowerCase().trim() }).lean();
  } catch (err) {
    logger.error({ err }, 'validate: DB error fetching coupon');
    throw err;
  }

  if (!coupon) {
    return {
      verdict: EligibilityVerdict.fail(REASONS.NOT_FOUND, 'Coupon code not found.'),
    };
  }

  // Status check
  if (coupon.status === 'paused' || coupon.status === 'draft') {
    return {
      verdict: EligibilityVerdict.fail(REASONS.DISABLED, 'This coupon is not currently active.'),
      coupon,
    };
  }

  // Expired status
  if (coupon.status === 'expired') {
    return {
      verdict: EligibilityVerdict.fail(REASONS.EXPIRED, 'This coupon has expired.'),
      coupon,
    };
  }

  const now = ctx.now instanceof Date ? ctx.now : new Date();

  // Date window checks
  if (coupon.starts_at && now < new Date(coupon.starts_at)) {
    return {
      verdict: EligibilityVerdict.fail(REASONS.NOT_STARTED, 'This coupon is not yet active.'),
      coupon,
    };
  }

  if (coupon.ends_at && now > new Date(coupon.ends_at)) {
    return {
      verdict: EligibilityVerdict.fail(REASONS.EXPIRED, 'This coupon has expired.'),
      coupon,
    };
  }

  // Global uses_remaining check
  if (coupon.uses_remaining !== null && coupon.uses_remaining <= 0) {
    return {
      verdict: EligibilityVerdict.fail(REASONS.GLOBAL_CAP_REACHED, 'This coupon has reached its usage limit.'),
      coupon,
    };
  }

  // Per-user cap check (skipped when re-validating an existing reservation at redeem time)
  if (!skipUserCapCheck && (phone || user_id)) {
    const phoneFilter = phone ? { phone_e164: phone } : {};
    const userFilter = user_id ? { user_id } : {};
    const userRedemptions = await CouponRedemption.countDocuments({
      coupon_id: coupon._id,
      state: { $in: ['reserved', 'redeemed'] },
      ...phoneFilter,
      ...userFilter,
    });
    if (userRedemptions >= (coupon.max_uses_user || 1)) {
      return {
        verdict: EligibilityVerdict.fail(REASONS.USER_CAP_REACHED, 'You have already used this coupon.'),
        coupon,
      };
    }
  }

  // Build full context for predicates
  // phone is passed explicitly so predicates (e.g. FirstOrder) can do server-side DB lookups.
  // ctx is spread last so callers can still override other fields, but phone stays server-resolved.
  const fullCtx = {
    subtotal: cart.subtotal || 0,
    items: cart.items || [],
    shipping_cost: cart.shipping_cost || 0,
    now,
    ...ctx,
    phone: phone || ctx.phone || null,
  };

  // Sort a working copy of rules by predicate cost (cheap → medium → expensive)
  // so that cheap in-memory checks short-circuit before expensive DB hits.
  const COST_ORDER = { cheap: 0, medium: 1, expensive: 2 };
  const sortedRules = (coupon.rules || []).slice().sort((a, b) => {
    const aC = COST_ORDER[predicateRegistry.getEntry(a.type)?.cost ?? 'medium'] ?? 1;
    const bC = COST_ORDER[predicateRegistry.getEntry(b.type)?.cost ?? 'medium'] ?? 1;
    return aC - bC;
  });

  // AND-of-rules: all predicates must pass (predicates may be async)
  for (const rule of sortedRules) {
    const predFn = predicateRegistry.get(rule.type);
    if (!predFn) {
      logger.warn({ rule_type: rule.type }, 'validate: unknown predicate type — skipping');
      continue;
    }
    const verdict = await predFn(rule, fullCtx);
    if (!verdict.eligible) {
      return { verdict, coupon };
    }
  }

  // Compute discount
  const RewardClass = rewardRegistry.get(coupon.reward.type);
  if (!RewardClass) {
    logger.error({ reward_type: coupon.reward.type }, 'validate: unknown reward type');
    return {
      verdict: EligibilityVerdict.fail(REASONS.NOT_ELIGIBLE, 'Unsupported reward type.'),
      coupon,
    };
  }

  // Hydrate reward-specific context BEFORE calling the (sync) reward class.
  // For free_gift, this resolves the Product doc once so the reward can build
  // the enriched response (product_name, product_image, unit_label,
  // display_label). Lookup failure degrades silently — reward returns the
  // legacy minimal shape and older mobile builds keep working.
  const rewardCtx = { ...cart, ...fullCtx };
  if (coupon.reward.type === 'free_gift' && coupon.reward.gift_product_id) {
    try {
      const Product = require('../../../repositories').products.rawModel();
      const giftProduct = await Product.findById(coupon.reward.gift_product_id)
        .select('product variantsData giftVariantId')
        .lean();
      if (giftProduct) {
        rewardCtx.giftProduct = giftProduct;
      } else {
        logger.warn(
          { gift_product_id: coupon.reward.gift_product_id, coupon_code: coupon.code },
          'validate: free_gift product not found — degrading to minimal shape'
        );
      }
    } catch (err) {
      logger.warn(
        { err, gift_product_id: coupon.reward.gift_product_id, coupon_code: coupon.code },
        'validate: free_gift hydration failed — degrading to minimal shape'
      );
    }
  }

  const discount = RewardClass.apply(coupon.reward, rewardCtx);

  return {
    verdict: EligibilityVerdict.pass(),
    discount,
    coupon,
  };
}

module.exports = { validate };
