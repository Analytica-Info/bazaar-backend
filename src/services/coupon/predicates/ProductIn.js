'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * ProductIn predicate — cart must contain at least one of the specified products.
 *
 * Rule shape: { type: 'product_in', product_ids: string[] }
 * Ctx shape:  { items: Array<{ product_id: string }> }
 *
 * @param {{ type: string, product_ids: string[] }} rule
 * @param {{ items?: Array<{ product_id: string }> }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function productIn(rule, ctx) {
  const allowed = new Set(Array.isArray(rule.product_ids) ? rule.product_ids : []);
  if (allowed.size === 0) return EligibilityVerdict.pass();

  const items = Array.isArray(ctx.items) ? ctx.items : [];
  const hasMatch = items.some(
    (item) => item.product_id && allowed.has(String(item.product_id))
  );

  if (hasMatch) return EligibilityVerdict.pass();

  return EligibilityVerdict.fail(
    REASONS.NOT_ELIGIBLE,
    'This coupon requires specific products in your cart.',
    true
  );
}

register('product_in', productIn, { cost: 'cheap' });
module.exports = productIn;
