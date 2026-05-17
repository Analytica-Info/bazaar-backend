'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * PaymentMethodIn predicate — only valid for specified payment methods.
 *
 * Rule shape: { type: 'payment_method_in', methods: string[] }
 * Ctx shape:  { payment_method?: string }
 *
 * @param {{ type: string, methods: string[] }} rule
 * @param {{ payment_method?: string }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function paymentMethodIn(rule, ctx) {
  const allowed = Array.isArray(rule.methods) ? rule.methods : [];
  if (allowed.length === 0) return EligibilityVerdict.pass();

  const method = ctx.payment_method || '';

  if (allowed.includes(method)) return EligibilityVerdict.pass();

  return EligibilityVerdict.fail(
    REASONS.NOT_ELIGIBLE,
    'This coupon is not valid for the selected payment method.',
    false
  );
}

register('payment_method_in', paymentMethodIn, { cost: 'cheap' });
module.exports = paymentMethodIn;
