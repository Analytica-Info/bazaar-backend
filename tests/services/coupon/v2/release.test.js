require('../../../setup');
'use strict';
require('../../../setup');

/**
 * release.js use-case tests.
 */

const mongoose = require('mongoose');
const CouponV2 = require('../../../../src/models/CouponV2');
const CouponRedemption = require('../../../../src/models/CouponRedemption');
const { apply } = require('../../../../src/services/coupon/use-cases/apply');
const { release } = require('../../../../src/services/coupon/use-cases/release');

const USER_A = new mongoose.Types.ObjectId().toString();
const USER_B = new mongoose.Types.ObjectId().toString();

async function createCoupon(code = 'rel10', overrides = {}) {
  return CouponV2.create({
    code,
    name: 'Release Test',
    status: 'active',
    max_uses_user: 1,
    uses_remaining: 5,
    max_uses_total: 5,
    reward: { type: 'flat', amount: 10 },
    rules: [],
    rule_version: 1,
    priority: 0,
    ...overrides,
  });
}

describe('release use-case', () => {
  it('requires redemption_id', async () => {
    const result = await release({ redemption_id: null, requesting_user_id: USER_A });
    expect(result.success).toBe(false);
  });

  it('marks reservation as released', async () => {
    await createCoupon('rel1');
    const applied = await apply({ code: 'rel1', phone: '+971501111111', user_id: USER_A, cart: { subtotal: 100 } });

    const result = await release({ redemption_id: applied.redemption_id, requesting_user_id: USER_A });
    expect(result.success).toBe(true);

    const redemption = await CouponRedemption.findById(applied.redemption_id).lean();
    expect(redemption.state).toBe('released');
    expect(redemption.released_at).toBeDefined();
  });

  it('restores uses_remaining on release', async () => {
    await createCoupon('rel2');
    const applied = await apply({ code: 'rel2', phone: '+971501111112', user_id: USER_A, cart: { subtotal: 100 } });

    const before = await CouponV2.findOne({ code: 'rel2' }).lean();
    const beforeRemaining = before.uses_remaining; // 4 after apply

    await release({ redemption_id: applied.redemption_id, requesting_user_id: USER_A });

    const after = await CouponV2.findOne({ code: 'rel2' }).lean();
    expect(after.uses_remaining).toBe(beforeRemaining + 1);
  });

  it('is idempotent — calling release twice is safe', async () => {
    await createCoupon('rel3');
    const applied = await apply({ code: 'rel3', phone: '+971501111113', user_id: USER_A, cart: { subtotal: 100 } });

    const r1 = await release({ redemption_id: applied.redemption_id, requesting_user_id: USER_A });
    const r2 = await release({ redemption_id: applied.redemption_id, requesting_user_id: USER_A });

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r2.already_released).toBe(true);
  });

  it('returns error for non-existent redemption_id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const result = await release({ redemption_id: fakeId, requesting_user_id: USER_A });
    expect(result.success).toBe(false);
  });

  // ── CRITICAL-2: IDOR guard ─────────────────────────────────────────────────

  it('IDOR: user B cannot release a redemption belonging to user A', async () => {
    await createCoupon('rel-idor');
    const applied = await apply({ code: 'rel-idor', phone: '+971501111114', user_id: USER_A, cart: { subtotal: 100 } });

    const result = await release({ redemption_id: applied.redemption_id, requesting_user_id: USER_B });

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.code).toBe('FORBIDDEN');

    // State must be unchanged
    const redemption = await CouponRedemption.findById(applied.redemption_id).lean();
    expect(redemption.state).toBe('reserved');

    // uses_remaining must be unchanged
    const coupon = await CouponV2.findOne({ code: 'rel-idor' }).lean();
    expect(coupon.uses_remaining).toBe(4); // decremented once by apply, not restored
  });

  // ── HIGH-3: unlimited coupon — uses_remaining stays null after release ─────

  it('unlimited coupon: uses_remaining stays null after release', async () => {
    await createCoupon('rel-unlimited', { uses_remaining: null, max_uses_total: null });
    const applied = await apply({ code: 'rel-unlimited', phone: '+971501111115', user_id: USER_A, cart: { subtotal: 100 } });

    await release({ redemption_id: applied.redemption_id, requesting_user_id: USER_A });

    const coupon = await CouponV2.findOne({ code: 'rel-unlimited' }).lean();
    expect(coupon.uses_remaining).toBeNull();
  });
});
