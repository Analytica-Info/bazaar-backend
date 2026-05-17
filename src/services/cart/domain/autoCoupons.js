'use strict';

/**
 * autoCoupons.js — read-only helpers that bridge the v2 coupon engine
 * into the cart domain. No CouponRedemption documents are created here;
 * reservation happens at order-create time (separate wave).
 *
 * Both exported functions degrade gracefully: on any error they log a
 * warn and return null so the caller falls back to legacy behaviour.
 */

const couponEngine = require('../../coupon');
const candidateRepository = require('../../coupon/infrastructure/candidateRepository');
const logger = require('../../../utilities/logger');

/**
 * Resolve the best auto-gift coupon for the current cart render.
 *
 * Calls evaluateAuto with trigger='cart_render', then filters to coupons
 * whose reward.type === 'free_gift', stack_group === 'gift', and
 * metadata.slot === slot.  The engine already picks the highest-priority
 * winner per stack_group, but we defensively re-pick here as well.
 *
 * @param {object}  params
 * @param {string}  [params.user_id]
 * @param {string}  [params.phone]
 * @param {object}  [params.cart]
 * @param {string}  [params.slot='cart_threshold_gift']
 * @returns {Promise<{ coupon: object, discount: object }|null>}
 */
async function resolveAutoGift({ user_id, phone, cart = {}, slot = 'cart_threshold_gift' }) {
  try {
    const results = await couponEngine.evaluateAuto({
      trigger: 'cart_render',
      user_id,
      phone,
      cart,
    });

    if (!Array.isArray(results) || results.length === 0) return null;

    // Filter: must be a free_gift in the 'gift' stack_group with matching slot
    const candidates = results.filter(
      (r) =>
        r.coupon.reward?.type === 'free_gift' &&
        r.coupon.stack_group === 'gift' &&
        r.coupon.metadata?.slot === slot,
    );

    if (candidates.length === 0) return null;

    // Defensive re-pick: highest priority wins
    candidates.sort((a, b) => (b.coupon.priority || 0) - (a.coupon.priority || 0));
    const winner = candidates[0];

    return { coupon: winner.coupon, discount: winner.discount };
  } catch (err) {
    logger.warn({ ctx: { user_id, slot }, err }, 'autoCoupons.resolveAutoGift: engine error — degrading to null');
    return null;
  }
}

/**
 * Return the next threshold/gift-name hint for a cart that does not yet
 * qualify for a gift. Useful for building the "add AED X more" promo message.
 *
 * Queries candidateRepository for the lowest min_subtotal cart_render gift
 * coupon that is currently active.
 *
 * @param {object}  params
 * @param {string}  [params.user_id]
 * @param {string}  [params.phone]
 * @param {object}  [params.cart]
 * @returns {Promise<{ threshold: number, gift_name: string }|null>}
 */
async function nextGiftThreshold({ user_id, phone, cart = {} }) {
  try {
    const candidates = await candidateRepository.findActiveByTrigger('cart_render');

    // Only consider free_gift coupons in the gift stack_group
    const giftCoupons = (candidates || []).filter(
      (c) =>
        c.reward?.type === 'free_gift' &&
        c.stack_group === 'gift',
    );

    if (giftCoupons.length === 0) return null;

    // Find the lowest min_subtotal threshold across all gift candidates
    let lowestThreshold = Infinity;
    let giftName = 'Gift';

    for (const coupon of giftCoupons) {
      const minSubRule = Array.isArray(coupon.rules)
        ? coupon.rules.find((r) => r.type === 'min_subtotal')
        : null;

      if (minSubRule && typeof minSubRule.amount === 'number' && minSubRule.amount < lowestThreshold) {
        lowestThreshold = minSubRule.amount;
        giftName = coupon.reward?.gift_product_name || 'Gift';
      }
    }

    if (!Number.isFinite(lowestThreshold)) return null;

    return { threshold: lowestThreshold, gift_name: giftName };
  } catch (err) {
    logger.warn({ ctx: { user_id }, err }, 'autoCoupons.nextGiftThreshold: error — degrading to null');
    return null;
  }
}

module.exports = { resolveAutoGift, nextGiftThreshold };
