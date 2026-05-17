'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * MinSubtotal predicate — rejects if cart subtotal is below the minimum.
 *
 * Rule shape: { type: 'min_subtotal', amount: number }
 * Ctx shape:  { subtotal: number }
 *
 * @param {{ type: string, amount: number }} rule
 * @param {{ subtotal: number }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function minSubtotal(rule, ctx) {
  const min = Number(rule.amount) || 0;
  const subtotal = Number(ctx.subtotal) || 0;

  if (subtotal >= min) {
    return EligibilityVerdict.pass();
  }

  return EligibilityVerdict.fail(
    REASONS.BELOW_MINIMUM,
    `Minimum order subtotal is ${min} AED.`,
    true
  );
}

register('min_subtotal', minSubtotal, { cost: 'cheap' });
module.exports = minSubtotal;
