'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * Geo predicate — coupon is only valid for orders from specified countries.
 *
 * Rule shape: { type: 'geo', countries: string[] }  (ISO 3166-1 alpha-2)
 * Ctx shape:  { country?: string }
 *
 * @param {{ type: string, countries: string[] }} rule
 * @param {{ country?: string }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function geo(rule, ctx) {
  const allowed = Array.isArray(rule.countries) ? rule.countries : [];
  if (allowed.length === 0) return EligibilityVerdict.pass();

  const country = (ctx.country || '').toUpperCase();

  if (allowed.map((c) => c.toUpperCase()).includes(country)) {
    return EligibilityVerdict.pass();
  }

  return EligibilityVerdict.fail(
    REASONS.NOT_ELIGIBLE,
    'This coupon is not available in your region.',
    false
  );
}

register('geo', geo, { cost: 'cheap' });
module.exports = geo;
