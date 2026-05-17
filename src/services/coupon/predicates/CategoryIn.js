'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * CategoryIn predicate — cart must contain at least one item in the allowed categories.
 *
 * Rule shape: { type: 'category_in', categories: string[] }
 * Ctx shape:  { items: Array<{ category_id: string }> }
 *
 * @param {{ type: string, categories: string[] }} rule
 * @param {{ items?: Array<{ category_id: string }> }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function categoryIn(rule, ctx) {
  const allowed = new Set(Array.isArray(rule.categories) ? rule.categories : []);
  if (allowed.size === 0) return EligibilityVerdict.pass();

  const items = Array.isArray(ctx.items) ? ctx.items : [];
  const hasMatch = items.some(
    (item) => item.category_id && allowed.has(String(item.category_id))
  );

  if (hasMatch) return EligibilityVerdict.pass();

  return EligibilityVerdict.fail(
    REASONS.NOT_ELIGIBLE,
    'This coupon requires specific categories in your cart.',
    true
  );
}

register('category_in', categoryIn, { cost: 'cheap' });
module.exports = categoryIn;
