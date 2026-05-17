'use strict';

const { register } = require('./index');
const AppliedDiscount = require('../domain/AppliedDiscount');

/**
 * BxGyReward — Buy X (quantity), Get Y free.
 *
 * Config shape: {
 *   type: 'bxgy',
 *   buy_quantity: number,      // e.g. 2
 *   get_quantity: number,      // e.g. 1
 *   get_product_ids?: string[] // restrict free items to these products; empty = any item
 * }
 * Cart shape: {
 *   items: Array<{ product_id: string, quantity: number, unit_price: number }>
 * }
 *
 * Strategy:
 *   - Total quantity across ALL items counts towards the "buy" threshold.
 *   - Eligible free items are those in get_product_ids (or any item if empty).
 *   - The cheapest eligible units are made free (sorted ascending by price).
 *   - One free unit awarded per complete buy_quantity bought.
 */
class BxGyReward {
  /**
   * @param {{ buy_quantity: number, get_quantity: number, get_product_ids?: string[] }} rewardConfig
   * @param {{ items: Array<{ product_id: string, quantity: number, unit_price: number }> }} cart
   * @returns {AppliedDiscount}
   */
  static apply(rewardConfig, cart) {
    const buyQty = Number(rewardConfig.buy_quantity) || 0;
    const getQty = Number(rewardConfig.get_quantity) || 0;
    const allowed = new Set(Array.isArray(rewardConfig.get_product_ids)
      ? rewardConfig.get_product_ids
      : []);
    const items = Array.isArray(cart.items) ? cart.items : [];

    // Total quantity of all items (counts towards buy threshold)
    const totalQty = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);

    if (buyQty <= 0 || getQty <= 0 || totalQty < buyQty) {
      return new AppliedDiscount({ aed: 0, type: 'bxgy', meta: { free_units: [] } });
    }

    // Number of free items = floor(totalQty / buyQty) * getQty (capped by eligible)
    const freeCount = Math.floor(totalQty / buyQty) * getQty;

    // Expand eligible-for-free items, sorted cheapest-first
    const eligibleUnits = [];
    for (const item of items) {
      if (allowed.size > 0 && !allowed.has(String(item.product_id))) continue;
      const qty = Number(item.quantity) || 1;
      for (let i = 0; i < qty; i++) {
        eligibleUnits.push({ product_id: String(item.product_id), price: Number(item.unit_price) || 0 });
      }
    }
    eligibleUnits.sort((a, b) => a.price - b.price);

    const freeUnits = eligibleUnits.slice(0, freeCount);
    const aed = freeUnits.reduce((sum, u) => sum + u.price, 0);

    return new AppliedDiscount({
      aed,
      type: 'bxgy',
      meta: { free_units: freeUnits },
    });
  }
}

register('bxgy', BxGyReward);
module.exports = BxGyReward;
