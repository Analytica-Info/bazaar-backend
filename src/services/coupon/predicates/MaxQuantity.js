'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * MaxQuantity predicate — total cart item quantity must not exceed the maximum.
 *
 * Rule shape: { type: 'max_quantity', max: number }
 * Ctx shape:  { items: Array<{ quantity: number }> }
 *
 * @param {{ type: string, max: number }} rule
 * @param {{ items?: Array<{ quantity: number }> }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function maxQuantity(rule, ctx) {
  const max = Number(rule.max);
  if (!isFinite(max)) return EligibilityVerdict.pass();

  const items = Array.isArray(ctx.items) ? ctx.items : [];
  const total = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);

  if (total <= max) return EligibilityVerdict.pass();

  return EligibilityVerdict.fail(
    REASONS.NOT_ELIGIBLE,
    `This coupon is valid for up to ${max} item(s) per order.`,
    true
  );
}

register('max_quantity', maxQuantity, { cost: 'cheap' });
module.exports = maxQuantity;
