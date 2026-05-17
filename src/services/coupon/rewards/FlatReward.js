'use strict';

const { register } = require('./index');
const AppliedDiscount = require('../domain/AppliedDiscount');

/**
 * FlatReward — fixed AED discount, clamped to subtotal so it never goes negative.
 *
 * Config shape: { type: 'flat', amount: number }
 * Cart shape:   { subtotal: number }
 */
class FlatReward {
  /**
   * @param {{ amount: number }} rewardConfig
   * @param {{ subtotal: number }} cart
   * @returns {AppliedDiscount}
   */
  static apply(rewardConfig, cart) {
    const amount = Number(rewardConfig.amount) || 0;
    const subtotal = Number(cart.subtotal) || 0;
    const aed = Math.min(amount, subtotal); // clamp — never negative
    return new AppliedDiscount({ aed, type: 'flat', meta: { amount } });
  }
}

register('flat', FlatReward);
module.exports = FlatReward;
