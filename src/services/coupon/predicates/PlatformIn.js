'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * PlatformIn predicate — restricts a coupon to specific client platforms.
 *
 * SECURITY: trusts ctx.platform, which is server-resolved by
 * src/middleware/platform.js from X-Client header / cookie / Bearer.
 * Treat targeting as soft segmentation: clients can spoof X-Client.
 * For revenue-protection (not just marketing), pair with a stronger
 * server-side platform signal (mobile attestation, mobile-issued JWT).
 *
 * Rule shape: { type: 'platform_in', platforms: Array<'web'|'mobile'> }
 * Ctx shape:  { platform?: 'web'|'mobile' }
 *
 * Empty / missing `platforms` array → pass (misconfigured rule does not block).
 *
 * @param {{ type: string, platforms?: string[] }} rule
 * @param {{ platform?: string }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function platformIn(rule, ctx) {
  const allowed = Array.isArray(rule.platforms) ? rule.platforms : [];
  if (allowed.length === 0) return EligibilityVerdict.pass();

  const platform = ctx && typeof ctx.platform === 'string' ? ctx.platform : null;
  if (platform && allowed.includes(platform)) return EligibilityVerdict.pass();

  return EligibilityVerdict.fail(
    REASONS.PLATFORM_NOT_ELIGIBLE,
    `This coupon is not available on ${platform || 'this platform'}.`,
    false
  );
}

register('platform_in', platformIn, { cost: 'cheap' });
module.exports = platformIn;
