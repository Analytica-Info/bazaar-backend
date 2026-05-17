'use strict';

const { register } = require('./index');
const EligibilityVerdict = require('../domain/EligibilityVerdict');
const REASONS = require('../domain/rejection-reasons');

/**
 * FirstOrder predicate — rejects if the user has placed any prior orders.
 *
 * SECURITY: does NOT trust ctx.is_first_order (client-supplied). Instead
 * queries the Order collection server-side by phone_e164.
 *
 * Rule shape: { type: 'first_order' }
 * Ctx shape:  { phone: string }
 *
 * @param {{ type: string }} rule
 * @param {{ phone?: string }} ctx
 * @returns {Promise<import('../domain/EligibilityVerdict')>}
 */
async function firstOrder(rule, ctx) {
  const phone = ctx.phone || null;

  if (!phone) {
    // No phone available — cannot verify first-order status; conservative reject.
    return EligibilityVerdict.fail(
      REASONS.FIRST_ORDER_ONLY,
      'This coupon is for first-time orders only.',
      false
    );
  }

  const Order = require('../../../repositories').orders.rawModel();
  // TODO: tighten to status:{$in:['completed','paid','delivered']} once enum values are confirmed.
  // Using any prior order as the conservative disqualifier for now.
  const priorOrderCount = await Order.countDocuments({ phone });

  if (priorOrderCount === 0) {
    return EligibilityVerdict.pass();
  }

  return EligibilityVerdict.fail(
    REASONS.FIRST_ORDER_ONLY,
    'This coupon is for first-time orders only.',
    false
  );
}

register('first_order', firstOrder, { cost: 'expensive' });
module.exports = firstOrder;
