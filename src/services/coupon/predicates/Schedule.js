'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * Schedule predicate — coupon is only valid during specified time windows.
 *
 * Rule shape: { type: 'schedule', windows: Array<{ start: string, end: string }> }
 *   where start/end are ISO-8601 date strings.
 * Ctx shape:  { now?: Date } — defaults to current time if omitted.
 *
 * @param {{ type: string, windows: Array<{ start: string, end: string }> }} rule
 * @param {{ now?: Date }} ctx
 * @returns {import('../domain/EligibilityVerdict')}
 */
function schedule(rule, ctx) {
  const windows = Array.isArray(rule.windows) ? rule.windows : [];
  if (windows.length === 0) return EligibilityVerdict.pass();

  const now = ctx.now instanceof Date ? ctx.now : new Date();

  const active = windows.some(({ start, end }) => {
    const s = new Date(start);
    const e = new Date(end);
    return now >= s && now <= e;
  });

  if (active) return EligibilityVerdict.pass();

  return EligibilityVerdict.fail(
    REASONS.NOT_ELIGIBLE,
    'This coupon is not valid at this time.',
    false
  );
}

register('schedule', schedule, { cost: 'cheap' });
module.exports = schedule;
