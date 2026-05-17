'use strict';
require('../../../setup');

/**
 * redeem.js use-case tests — HIGH-2: discount re-verification against final_cart.
 */

const CouponV2 = require('../../../../src/models/CouponV2');
const CouponRedemption = require('../../../../src/models/CouponRedemption');
const { apply } = require('../../../../src/services/coupon/use-cases/apply');
const { redeem } = require('../../../../src/services/coupon/use-cases/redeem');

async function createCoupon(code, overrides = {}) {
  return CouponV2.create({
    code,
    name: 'Redeem Test',
    status: 'active',
    max_uses_user: 1,
    uses_remaining: null,
    reward: { type: 'flat', amount: 10 },
    rules: [{ type: 'min_subtotal', amount: 100 }],
    rule_version: 1,
    priority: 0,
    ...overrides,
  });
}

describe('redeem use-case', () => {
  it('requires redemption_id', async () => {
    const result = await redeem({ redemption_id: null, final_cart: { subtotal: 200 } });
    expect(result.success).toBe(false);
  });

  it('requires final_cart', async () => {
    const result = await redeem({ redemption_id: 'fake', final_cart: null });
    expect(result.success).toBe(false);
  });

  it('successfully redeems a valid reservation', async () => {
    await createCoupon('rdm-ok');
    const applied = await apply({ code: 'rdm-ok', phone: '+971502000001', cart: { subtotal: 200 } });
    expect(applied.error).toBeUndefined();

    const result = await redeem({ redemption_id: applied.redemption_id, order_id: 'order-1', final_cart: { subtotal: 200 } });
    expect(result.success).toBe(true);

    const redemption = await CouponRedemption.findById(applied.redemption_id).lean();
    expect(redemption.state).toBe('redeemed');
    expect(redemption.order_id).toBe('order-1');
  });

  // ── HIGH-2: CART_CHANGED ───────────────────────────────────────────────────

  it('CART_CHANGED: applied with subtotal 500, redeem with final_cart subtotal 50 — rejects', async () => {
    await createCoupon('rdm-cartchange', {
      rules: [{ type: 'min_subtotal', amount: 100 }],
    });
    const applied = await apply({ code: 'rdm-cartchange', phone: '+971502000002', cart: { subtotal: 500 } });
    expect(applied.error).toBeUndefined();

    // Cart dropped below minimum
    const result = await redeem({
      redemption_id: applied.redemption_id,
      order_id: 'order-2',
      final_cart: { subtotal: 50 },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('CART_CHANGED');

    // State must remain 'reserved' — not advanced
    const redemption = await CouponRedemption.findById(applied.redemption_id).lean();
    expect(redemption.state).toBe('reserved');
  });

  it('is idempotent-safe: second redeem on already-redeemed reservation fails', async () => {
    await createCoupon('rdm-double');
    const applied = await apply({ code: 'rdm-double', phone: '+971502000003', cart: { subtotal: 200 } });

    await redeem({ redemption_id: applied.redemption_id, order_id: 'order-3', final_cart: { subtotal: 200 } });
    const result2 = await redeem({ redemption_id: applied.redemption_id, order_id: 'order-3', final_cart: { subtotal: 200 } });

    expect(result2.success).toBe(false);
  });
});
