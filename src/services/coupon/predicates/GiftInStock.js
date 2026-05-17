'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * GiftInStock predicate — rejects if the gift product's available stock is
 * at or below the configured min_buffer.
 *
 * Rule shape: { type: 'gift_in_stock', gift_product_id: string, min_buffer?: number }
 *
 * Behaviour:
 *  - If gift_product_id is absent (misconfigured rule), the predicate PASSES
 *    rather than blocking a valid coupon flow.
 *  - min_buffer defaults to 0. The historical operational default is 5; set it
 *    explicitly on the rule document if that buffer is needed.
 *  - Fails with OUT_OF_STOCK when (totalQty - min_buffer) <= 0.
 *
 * @param {{ type: string, gift_product_id?: string, min_buffer?: number }} rule
 * @param {object} _ctx - not used; reads DB directly
 * @returns {Promise<import('../domain/EligibilityVerdict')>}
 */
async function giftInStock(rule, _ctx) {
  if (!rule.gift_product_id) {
    // Misconfigured rule — pass rather than silently blocking.
    return EligibilityVerdict.pass();
  }

  const minBuffer = typeof rule.min_buffer === 'number' ? rule.min_buffer : 0;

  const Product = require('../../../repositories').products.rawModel();
  const product = await Product.findById(rule.gift_product_id).select('totalQty').lean();

  if (!product) {
    // Product not found — treat as out-of-stock.
    return EligibilityVerdict.fail(
      REASONS.OUT_OF_STOCK,
      'The gift product is not available.',
      false
    );
  }

  const available = (product.totalQty || 0) - minBuffer;

  if (available <= 0) {
    return EligibilityVerdict.fail(
      REASONS.OUT_OF_STOCK,
      'The gift product is currently out of stock.',
      false
    );
  }

  return EligibilityVerdict.pass();
}

register('gift_in_stock', giftInStock, { cost: 'medium' });
module.exports = giftInStock;
