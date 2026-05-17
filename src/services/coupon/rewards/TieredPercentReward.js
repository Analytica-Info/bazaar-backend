'use strict';

const { register } = require('./index');
const AppliedDiscount = require('../domain/AppliedDiscount');

/**
 * TieredPercentReward — percentage off that scales with subtotal tiers.
 *
 * Config shape: {
 *   type: 'tiered_percent',
 *   tiers: Array<{ min_subtotal: number, percent: number, cap_aed?: number }>,
 *   // tiers sorted ascending by min_subtotal
 * }
 * Cart shape: { subtotal: number }
 *
 * The highest tier whose min_subtotal <= cart.subtotal is applied.
 * If subtotal is below the lowest tier, discount = 0.
 */
class TieredPercentReward {
  /**
   * @param {{ tiers: Array<{ min_subtotal: number, percent: number, cap_aed?: number }> }} rewardConfig
   * @param {{ subtotal: number }} cart
   * @returns {AppliedDiscount}
   */
  static apply(rewardConfig, cart) {
    const tiers = Array.isArray(rewardConfig.tiers) ? rewardConfig.tiers : [];
    const subtotal = Number(cart.subtotal) || 0;

    // Sort descending by min_subtotal and find first match
    const sorted = [...tiers].sort((a, b) => b.min_subtotal - a.min_subtotal);
    const match = sorted.find((t) => subtotal >= Number(t.min_subtotal));

    if (!match) {
      return new AppliedDiscount({ aed: 0, type: 'tiered_percent', meta: { tier: null } });
    }

    const percent = Number(match.percent) || 0;
    const cap = match.cap_aed != null ? Number(match.cap_aed) : Infinity;
    let aed = (percent / 100) * subtotal;
    if (isFinite(cap)) aed = Math.min(aed, cap);

    return new AppliedDiscount({
      aed,
      type: 'tiered_percent',
      meta: { tier: match, percent, cap_aed: match.cap_aed ?? null },
    });
  }
}

register('tiered_percent', TieredPercentReward);
module.exports = TieredPercentReward;
