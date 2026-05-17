'use strict';

const { register } = require('./index');
const AppliedDiscount = require('../domain/AppliedDiscount');

/**
 * PercentReward — percentage off subtotal, with optional AED cap.
 *
 * Config shape: { type: 'percent', percent: number, cap_aed?: number }
 * Cart shape:   { subtotal: number }
 */
class PercentReward {
  /**
   * @param {{ percent: number, cap_aed?: number }} rewardConfig
   * @param {{ subtotal: number }} cart
   * @returns {AppliedDiscount}
   */
  static apply(rewardConfig, cart) {
    const percent = Number(rewardConfig.percent) || 0;
    const cap = rewardConfig.cap_aed != null ? Number(rewardConfig.cap_aed) : Infinity;
    const subtotal = Number(cart.subtotal) || 0;

    let aed = (percent / 100) * subtotal;
    if (isFinite(cap)) {
      aed = Math.min(aed, cap);
    }

    return new AppliedDiscount({
      aed,
      type: 'percent',
      meta: { percent, cap_aed: rewardConfig.cap_aed ?? null },
    });
  }
}

register('percent', PercentReward);
module.exports = PercentReward;
