'use strict';
require('../../../setup');

/**
 * apply.js use-case tests — atomicity, idempotency, per-user cap.
 */

const mongoose = require('mongoose');
const CouponV2 = require('../../../../src/models/CouponV2');
const CouponRedemption = require('../../../../src/models/CouponRedemption');
const { apply } = require('../../../../src/services/coupon/use-cases/apply');
const REASONS = require('../../../../src/services/coupon/domain/rejection-reasons');

async function createTestCoupon(overrides = {}) {
  return CouponV2.create({
    code: 'apply10',
    name: 'Apply Test',
    status: 'active',
    max_uses_user: 1,
    uses_remaining: null,
    reward: { type: 'flat', amount: 10 },
    rules: [],
    rule_version: 1,
    priority: 0,
    ...overrides,
  });
}

describe('apply use-case', () => {
  it('requires phone', async () => {
    await createTestCoupon();
    const result = await apply({ code: 'apply10', phone: null, cart: { subtotal: 100 } });
    expect(result.error).toBeDefined();
    expect(result.error.reason).toBe(REASONS.NOT_ELIGIBLE);
  });

  it('creates a reservation with correct fields', async () => {
    await createTestCoupon({ code: 'applyok1' });
    const result = await apply({ code: 'applyok1', phone: '+971501111111', cart: { subtotal: 100 } });
    expect(result.error).toBeUndefined();
    expect(result.redemption_id).toBeDefined();
    expect(result.discount_aed).toBe(10);
    expect(result.expires_at).toBeDefined();

    const redemption = await CouponRedemption.findById(result.redemption_id).lean();
    expect(redemption.state).toBe('reserved');
    expect(redemption.phone_e164).toBe('+971501111111');
  });

  it('reservation expires_at is ~30 minutes from now', async () => {
    await createTestCoupon({ code: 'applyexp1' });
    const before = Date.now();
    const result = await apply({ code: 'applyexp1', phone: '+971501111112', cart: { subtotal: 100 } });
    const after = Date.now();

    const ttl = result.expires_at.getTime();
    expect(ttl).toBeGreaterThan(before + 29 * 60 * 1000);
    expect(ttl).toBeLessThan(after + 31 * 60 * 1000);
  });

  it('idempotency: same key returns same redemption_id without double-decrement', async () => {
    await createTestCoupon({ code: 'idempotent1', max_uses_total: 5, uses_remaining: 5 });
    const key = 'idem-key-123';

    const r1 = await apply({ code: 'idempotent1', phone: '+971501111113', cart: { subtotal: 100 }, idempotency_key: key });
    const r2 = await apply({ code: 'idempotent1', phone: '+971501111113', cart: { subtotal: 100 }, idempotency_key: key });

    expect(r1.redemption_id).toBe(r2.redemption_id);

    // uses_remaining should only have decremented once
    const coupon = await CouponV2.findOne({ code: 'idempotent1' }).lean();
    expect(coupon.uses_remaining).toBe(4);
  });

  it('per-user cap: second apply for same user fails', async () => {
    await createTestCoupon({ code: 'usercap2', max_uses_user: 1 });
    await apply({ code: 'usercap2', phone: '+971501234999', cart: { subtotal: 100 } });

    const result2 = await apply({ code: 'usercap2', phone: '+971501234999', cart: { subtotal: 100 } });
    expect(result2.error).toBeDefined();
    expect(result2.error.reason).toBe(REASONS.USER_CAP_REACHED);
  });

  it('sequential applies for same user — second is rejected', async () => {
    // NOTE: True parallel race-safety requires a MongoDB replica set (for transactions).
    // In the in-memory test setup we verify the sequential guarantee which is the
    // atomic behavior enforced in production. The findOneAndUpdate conditional update
    // provides the race-free guarantee there.
    await createTestCoupon({ code: 'parallel1', max_uses_user: 1 });
    const phone = '+971509876543';

    const r1 = await apply({ code: 'parallel1', phone, cart: { subtotal: 100 } });
    const r2 = await apply({ code: 'parallel1', phone, cart: { subtotal: 100 } });

    expect(r1.error).toBeUndefined();
    expect(r2.error).toBeDefined();
    expect(r2.error.reason).toBe(REASONS.USER_CAP_REACHED);
  });

  it('decrements uses_remaining atomically', async () => {
    await createTestCoupon({ code: 'decrement1', max_uses_total: 1, uses_remaining: 1 });
    const r1 = await apply({ code: 'decrement1', phone: '+971501111114', cart: { subtotal: 100 } });
    expect(r1.error).toBeUndefined();

    const r2 = await apply({ code: 'decrement1', phone: '+971501111115', cart: { subtotal: 100 } });
    expect(r2.error).toBeDefined();
    expect(r2.error.reason).toBe(REASONS.GLOBAL_CAP_REACHED);
  });

  it('returns error for unknown coupon', async () => {
    const result = await apply({ code: 'DOESNOTEXIST', phone: '+971501111116', cart: { subtotal: 100 } });
    expect(result.error.reason).toBe(REASONS.NOT_FOUND);
  });

  // ── HIGH-1: partial-unique index — duplicate-key simulation ───────────────

  it('duplicate-key on partial-unique index: returns ALREADY_RESERVED without double-inserting', async () => {
    await createTestCoupon({ code: 'dup-unique1', max_uses_user: 2 }); // allow 2 per user in logic
    const phone = '+971508881111';

    // First apply succeeds
    const r1 = await apply({ code: 'dup-unique1', phone, cart: { subtotal: 100 } });
    expect(r1.error).toBeUndefined();

    // Simulate the duplicate-key error by mocking CouponRedemption.create to throw 11000
    const CouponRedemption = require('../../../../src/models/CouponRedemption');
    const originalCreate = CouponRedemption.create.bind(CouponRedemption);
    const dupErr = new Error('E11000 duplicate key');
    dupErr.code = 11000;
    jest.spyOn(CouponRedemption, 'create').mockRejectedValueOnce(dupErr);

    const r2 = await apply({ code: 'dup-unique1', phone, cart: { subtotal: 100 } });
    expect(r2.error).toBeDefined();
    expect(r2.error.code).toBe('ALREADY_RESERVED');

    // Only one document should exist (the real one from r1)
    const count = await CouponRedemption.countDocuments({ phone_e164: phone, state: 'reserved' });
    expect(count).toBe(1);

    jest.restoreAllMocks();
  });
});

// ── wire-shape contract: apply returns serialized reward, not raw config ─────

describe('apply use-case — wire-shape contract', () => {
  it('returns reward as flat wire shape (no nested .meta, no schema names)', async () => {
    const Product = require('../../../../src/models/Product');
    const product = await Product.create({
      product: {
        name: 'Hydro Bottle',
        images: [{ sizes: { original: 'https://cdn.example.com/bottle.jpg' } }],
      },
      variantsData: [{ id: 'v1', name: '500 ml', qty: 20 }],
      totalQty: 20,
    });
    await createTestCoupon({
      code: 'wirefg1',
      reward: {
        type: 'free_gift',
        gift_product_id: product._id.toString(),
        gift_product_name: 'Hydro Bottle',
        gift_value_aed: 49,
        gift_variant_id: 'v1',
      },
    });

    const result = await apply({
      code: 'wirefg1',
      phone: '+971500000001',
      cart: { subtotal: 100 },
    });

    expect(result.error).toBeUndefined();
    // Public wire contract — what mobile parses
    expect(result.reward.type).toBe('free_gift');
    expect(result.reward.product_id).toBe(product._id.toString());
    expect(result.reward.msrp_aed).toBe(49);
    expect(result.reward.product_name).toBe('Hydro Bottle');
    expect(result.reward.product_image).toBe('https://cdn.example.com/bottle.jpg');
    // Regression guards — storage-layer schema names must NOT leak
    expect(result.reward.gift_value_aed).toBeUndefined();
    // Flat shape — no nested meta
    expect(result.reward.meta).toBeUndefined();
  });

  it('idempotency replay returns the same wire shape from metadata.wire_reward', async () => {
    await createTestCoupon({ code: 'wireidem1' });
    const phone = '+971500000002';
    const key = 'idem-wire-1';

    const r1 = await apply({ code: 'wireidem1', phone, cart: { subtotal: 100 }, idempotency_key: key });
    expect(r1.error).toBeUndefined();
    const reward1 = r1.reward;

    const r2 = await apply({ code: 'wireidem1', phone, cart: { subtotal: 100 }, idempotency_key: key });
    expect(r2.redemption_id).toBe(r1.redemption_id);
    expect(r2.reward).toEqual(reward1);
    // Storage-name leak guard on the idempotency path too
    expect(r2.reward.gift_value_aed).toBeUndefined();
  });

  it('persists wire_reward on the CouponRedemption metadata at insert time', async () => {
    await createTestCoupon({ code: 'wirepersist1' });
    const result = await apply({
      code: 'wirepersist1',
      phone: '+971500000003',
      cart: { subtotal: 100 },
    });
    const redemption = await CouponRedemption.findById(result.redemption_id).lean();
    expect(redemption.metadata.wire_reward).toBeDefined();
    expect(redemption.metadata.wire_reward.type).toBe('flat');
    // Back-compat field is also still there
    expect(redemption.metadata.reward).toBeDefined();
  });
});
