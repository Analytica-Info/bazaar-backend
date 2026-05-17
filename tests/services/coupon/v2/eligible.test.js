require('../../../setup');
'use strict';

/**
 * eligible.js use-case tests.
 */

const CouponV2 = require('../../../../src/models/CouponV2');
const CouponRedemption = require('../../../../src/models/CouponRedemption');
const { eligible } = require('../../../../src/services/coupon/use-cases/eligible');

async function seed(overrides = []) {
  for (const o of overrides) {
    await CouponV2.create({
      code: o.code,
      name: o.name || o.code,
      status: o.status || 'active',
      max_uses_user: 1,
      uses_remaining: o.uses_remaining !== undefined ? o.uses_remaining : null,
      reward: o.reward || { type: 'flat', amount: 10 },
      rules: o.rules || [],
      rule_version: 1,
      priority: o.priority || 0,
    });
  }
}

describe('eligible use-case', () => {
  it('returns empty array when no coupons exist', async () => {
    const results = await eligible({ cart: { subtotal: 100 } });
    expect(results).toHaveLength(0);
  });

  it('returns only active coupons that pass predicates', async () => {
    await seed([
      { code: 'elig1', status: 'active', reward: { type: 'flat', amount: 5 } },
      { code: 'elig2', status: 'paused', reward: { type: 'flat', amount: 5 } },
      { code: 'elig3', status: 'draft', reward: { type: 'flat', amount: 5 } },
    ]);

    const results = await eligible({ cart: { subtotal: 100 } });
    const codes = results.map((r) => r.coupon.code);
    expect(codes).toContain('elig1');
    expect(codes).not.toContain('elig2');
    expect(codes).not.toContain('elig3');
  });

  it('sorts by priority desc then discount desc', async () => {
    await seed([
      { code: 'prio1', priority: 5, reward: { type: 'flat', amount: 10 } },
      { code: 'prio2', priority: 10, reward: { type: 'flat', amount: 5 } },
      { code: 'prio3', priority: 5, reward: { type: 'flat', amount: 20 } },
    ]);

    const results = await eligible({ cart: { subtotal: 100 } });
    const codes = results.map((r) => r.coupon.code);
    expect(codes[0]).toBe('prio2'); // highest priority
    expect(codes[1]).toBe('prio3'); // same prio as prio1 but higher discount
    expect(codes[2]).toBe('prio1');
  });

  it('caps results at 10', async () => {
    for (let i = 0; i < 15; i++) {
      await CouponV2.create({
        code: `bulk${i}`,
        name: `Bulk ${i}`,
        status: 'active',
        max_uses_user: 1,
        uses_remaining: null,
        reward: { type: 'flat', amount: 5 },
        rules: [],
        rule_version: 1,
        priority: 0,
      });
    }

    const results = await eligible({ cart: { subtotal: 100 } });
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('excludes coupons already redeemed by user', async () => {
    await seed([
      { code: 'used1', reward: { type: 'flat', amount: 10 } },
      { code: 'unused1', reward: { type: 'flat', amount: 10 } },
    ]);
    const coupon = await CouponV2.findOne({ code: 'used1' }).lean();
    await CouponRedemption.create({
      coupon_id: coupon._id,
      phone_e164: '+971501111999',
      state: 'redeemed',
      discount_aed: 10,
      rule_version: 1,
      expires_at: new Date(Date.now() + 3600000),
    });

    const results = await eligible({ phone: '+971501111999', cart: { subtotal: 100 } });
    const codes = results.map((r) => r.coupon.code);
    expect(codes).not.toContain('used1');
    expect(codes).toContain('unused1');
  });

  it('returns first_order coupon for a phone with no prior orders; excludes for a phone with prior orders', async () => {
    await seed([
      {
        code: 'fo1',
        rules: [{ type: 'first_order' }],
        reward: { type: 'flat', amount: 20 },
      },
    ]);

    // Phone with no prior orders in mem-db → first_order predicate passes.
    const withFirst = await eligible({ phone: '+971501110001', cart: { subtotal: 100 } });
    expect(withFirst.map((r) => r.coupon.code)).toContain('fo1');

    // Seed an Order for a different phone to simulate a returning customer.
    const Order = require('../../../../src/repositories').orders.rawModel();
    await Order.create({
      name: 'Returning Customer', phone: '+971501110002', address: '1 Test St',
      email: 'b@b.com', status: 'completed', amount_subtotal: '100',
      amount_total: '100', discount_amount: '0',
      txn_id: 'txn-fo-elig', payment_method: 'card', payment_status: 'paid',
      order_id: 'ORD-fo-elig', order_no: 900002,
    });

    const withoutFirst = await eligible({ phone: '+971501110002', cart: { subtotal: 100 } });
    expect(withoutFirst.map((r) => r.coupon.code)).not.toContain('fo1');
  });

  it('excludes coupons where uses_remaining = 0', async () => {
    await seed([{ code: 'exhaust1', uses_remaining: 0, reward: { type: 'flat', amount: 10 } }]);
    const results = await eligible({ cart: { subtotal: 100 } });
    expect(results.map((r) => r.coupon.code)).not.toContain('exhaust1');
  });
});

// ── wire-shape contract ─────────────────────────────────────────────────────

describe('eligible — wire-shape contract', () => {
  it('every candidate.coupon.reward is the public flat wire shape', async () => {
    await seed([
      { code: 'wireel1', reward: { type: 'flat', amount: 10 } },
      { code: 'wireel2', reward: { type: 'percent', percent_off: 20 } },
    ]);

    const results = await eligible({
      phone: '+971500000010',
      cart: { subtotal: 100 },
    });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const reward = r.coupon.reward;
      expect(reward).toBeDefined();
      expect(typeof reward.type).toBe('string');
      // Flat shape — never nested under .meta on the wire
      expect(reward.meta).toBeUndefined();
      // Regression guard for free_gift storage names — won't apply to flat/percent
      // entries above but the guard pins the rule for all reward types.
      expect(reward.gift_value_aed).toBeUndefined();
    }
  });

  it('free_gift eligible candidate emits product_id + msrp_aed, not storage names', async () => {
    const Product = require('../../../../src/models/Product');
    const product = await Product.create({
      product: { name: 'Tote', images: [{ url: 'https://cdn.example.com/tote.jpg' }] },
      totalQty: 50,
    });
    await seed([
      {
        code: 'wireelg1',
        reward: {
          type: 'free_gift',
          gift_product_id: product._id.toString(),
          gift_product_name: 'Tote',
          gift_value_aed: 30,
        },
      },
    ]);

    const results = await eligible({
      phone: '+971500000011',
      cart: { subtotal: 100 },
    });

    const gift = results.find((r) => r.coupon.code === 'wireelg1');
    expect(gift).toBeDefined();
    expect(gift.coupon.reward.type).toBe('free_gift');
    expect(gift.coupon.reward.product_id).toBe(product._id.toString());
    expect(gift.coupon.reward.msrp_aed).toBe(30);
    expect(gift.coupon.reward.product_name).toBe('Tote');
    expect(gift.coupon.reward.gift_value_aed).toBeUndefined();
  });
});
