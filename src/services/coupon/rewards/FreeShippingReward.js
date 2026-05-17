'use strict';

const { register } = require('./index');
const AppliedDiscount = require('../domain/AppliedDiscount');

/**
 * FreeShippingReward — waives the shipping cost.
 *
 * Config shape: { type: 'free_shipping', max_shipping_aed?: number }
 * Cart shape:   { shipping_cost?: number }
 */
class FreeShippingReward {
  /**
   * @param {{ max_shipping_aed?: number }} rewardConfig
   * @param {{ shipping_cost?: number }} cart
   * @returns {AppliedDiscount}
   */
  static apply(rewardConfig, cart) {
    const shipping = Number(cart.shipping_cost) || 0;
    const maxShipping = rewardConfig.max_shipping_aed != null
      ? Number(rewardConfig.max_shipping_aed)
      : Infinity;
    const aed = isFinite(maxShipping) ? Math.min(shipping, maxShipping) : shipping;

    return new AppliedDiscount({
      aed,
      type: 'free_shipping',
      meta: { shipping_cost_waived: aed },
    });
  }
}

register('free_shipping', FreeShippingReward);
module.exports = FreeShippingReward;
