'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * VerticalIn predicate — cart/request must be in one of the allowed verticals.
 *
 * Rule shape: { type: 'vertical_in', verticals: string[] }
 * Ctx shape:  { vertical: string }
 *
 * @param {{ type: string, verticals: string[] }} rule
 * @param {{ vertical?: string }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function verticalIn(rule, ctx) {
  const allowed = Array.isArray(rule.verticals) ? rule.verticals : [];
  if (allowed.length === 0) return EligibilityVerdict.pass();

  const vertical = ctx.vertical || '';

  if (allowed.includes(vertical)) return EligibilityVerdict.pass();

  return EligibilityVerdict.fail(
    REASONS.NOT_ELIGIBLE,
    'This coupon is not valid for the selected store.',
    false
  );
}

register('vertical_in', verticalIn, { cost: 'cheap' });
module.exports = verticalIn;
