'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * UserSegment predicate — checks the user belongs to one of the allowed segments.
 *
 * Rule shape: { type: 'user_segment', segments: string[] }
 * Ctx shape:  { user_segment: string }
 *
 * @param {{ type: string, segments: string[] }} rule
 * @param {{ user_segment?: string }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function userSegment(rule, ctx) {
  const allowed = Array.isArray(rule.segments) ? rule.segments : [];
  const segment = ctx.user_segment || '';

  if (allowed.length === 0 || allowed.includes(segment)) {
    return EligibilityVerdict.pass();
  }

  return EligibilityVerdict.fail(
    REASONS.NOT_ELIGIBLE,
    'This coupon is not available for your account.',
    false
  );
}

register('user_segment', userSegment, { cost: 'cheap' });
module.exports = userSegment;
