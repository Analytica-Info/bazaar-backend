require('../../../setup');
'use strict';

/**
 * validate.js use-case tests.
 */

const mongoose = require('mongoose');
const CouponV2 = require('../../../../src/models/CouponV2');
const CouponRedemption = require('../../../../src/models/CouponRedemption');
const { validate } = require('../../../../src/services/coupon/use-cases/validate');
const REASONS = require('../../../../src/services/coupon/domain/rejection-reasons');

function makeActiveCoupon(overrides = {}) {
  return {
    code: 'test10',
    name: 'Test 10',
    status: 'active',
    max_uses_user: 1,
    reward: { type: 'flat', amount: 10 },
    rules: [],
    rule_version: 1,
    priority: 0,
    ...overrides,
  };
}

describe('validate use-case', () => {
  it('returns NOT_FOUND for missing code', async () => {
    const { verdict } = await validate({ code: '' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.NOT_FOUND);
  });

  it('returns NOT_FOUND for unknown coupon', async () => {
    const { verdict } = await validate({ code: 'UNKNOWN123' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.NOT_FOUND);
  });

  it('returns DISABLED for paused coupon', async () => {
    await CouponV2.create(makeActiveCoupon({ code: 'paused1', status: 'paused' }));
    const { verdict } = await validate({ code: 'paused1' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.DISABLED);
  });

  it('returns DISABLED for draft coupon', async () => {
    await CouponV2.create(makeActiveCoupon({ code: 'draft1', status: 'draft' }));
    const { verdict } = await validate({ code: 'draft1' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.DISABLED);
  });

  it('returns EXPIRED for expired status', async () => {
    await CouponV2.create(makeActiveCoupon({ code: 'expired1', status: 'expired' }));
    const { verdict } = await validate({ code: 'expired1' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.EXPIRED);
  });

  it('returns EXPIRED when ends_at is in the past', async () => {
    await CouponV2.create(
      makeActiveCoupon({
        code: 'oldcoupon',
        ends_at: new Date('2020-01-01'),
      })
    );
    const { verdict } = await validate({ code: 'oldcoupon' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.EXPIRED);
  });

  it('returns NOT_STARTED when starts_at is in the future', async () => {
    await CouponV2.create(
      makeActiveCoupon({
        code: 'future1',
        starts_at: new Date('2099-01-01'),
      })
    );
    const { verdict } = await validate({ code: 'future1' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.NOT_STARTED);
  });

  it('returns GLOBAL_CAP_REACHED when uses_remaining is 0', async () => {
    await CouponV2.create(
      makeActiveCoupon({
        code: 'capped1',
        max_uses_total: 5,
        uses_remaining: 0,
      })
    );
    const { verdict } = await validate({ code: 'capped1' });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.GLOBAL_CAP_REACHED);
  });

  it('validates successfully for a simple active coupon', async () => {
    await CouponV2.create(makeActiveCoupon({ code: 'simple1' }));
    const { verdict, discount } = await validate({ code: 'simple1', cart: { subtotal: 100 } });
    expect(verdict.eligible).toBe(true);
    expect(discount.aed).toBe(10);
  });

  it('AND-of-rules: rejects if any predicate fails (first_order — phone has prior orders)', async () => {
    // Seed an Order so the DB query returns > 0 prior orders for this phone.
    const Order = require('../../../../src/repositories').orders.rawModel();
    await Order.create({
      name: 'Prior Customer', phone: '+971501111901', address: '1 Test St',
      email: 'a@a.com', status: 'completed', amount_subtotal: '100',
      amount_total: '100', discount_amount: '0',
      txn_id: 'txn-combo1', payment_method: 'card', payment_status: 'paid',
      order_id: 'ORD-combo1', order_no: 900001,
    });

    await CouponV2.create(
      makeActiveCoupon({
        code: 'combo1',
        rules: [
          { type: 'min_subtotal', amount: 100 },
          { type: 'first_order' },
        ],
        reward: { type: 'flat', amount: 20 },
      })
    );
    const { verdict } = await validate({
      code: 'combo1',
      phone: '+971501111901',
      cart: { subtotal: 200 },
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.FIRST_ORDER_ONLY);
  });

  it('AND-of-rules: all pass → eligible (first_order — phone has no prior orders)', async () => {
    await CouponV2.create(
      makeActiveCoupon({
        code: 'combo2',
        rules: [
          { type: 'min_subtotal', amount: 100 },
          { type: 'first_order' },
        ],
        reward: { type: 'flat', amount: 15 },
      })
    );
    // No Order docs for this phone in the mem-db → first_order passes.
    const { verdict, discount } = await validate({
      code: 'combo2',
      phone: '+971501111902',
      cart: { subtotal: 150 },
    });
    expect(verdict.eligible).toBe(true);
    expect(discount.aed).toBe(15);
  });

  it('is case-insensitive on code', async () => {
    await CouponV2.create(makeActiveCoupon({ code: 'lower1' }));
    const { verdict } = await validate({ code: 'LOWER1', cart: { subtotal: 100 } });
    expect(verdict.eligible).toBe(true);
  });

  describe('free_gift hydration', () => {
    const Product = require('../../../../src/models/Product');

    it('enriches discount.meta from the resolved Product doc', async () => {
      const product = await Product.create({
        product: {
          name: 'Glass Bottle',
          images: [{ sizes: { original: 'https://cdn.example.com/bottle.jpg' } }],
        },
        variantsData: [{ id: 'v-500', name: '500 ml', qty: 20 }],
        totalQty: 20,
      });
      await CouponV2.create(makeActiveCoupon({
        code: 'gift1',
        reward: {
          type: 'free_gift',
          gift_product_id: product._id.toString(),
          gift_product_name: '',
          gift_value_aed: 49,
          gift_variant_id: 'v-500',
        },
      }));

      const { verdict, discount } = await validate({ code: 'gift1', cart: { subtotal: 100 } });

      expect(verdict.eligible).toBe(true);
      expect(discount.type).toBe('free_gift');
      expect(discount.meta).toMatchObject({
        product_id: product._id.toString(),
        msrp_aed: 49,
        product_name: 'Glass Bottle',
        product_image: 'https://cdn.example.com/bottle.jpg',
        unit_label: '500 ml',
        display_label: 'Free Glass Bottle (worth AED 49)',
      });
    });

    it('degrades to required-field shape when gift_product_id resolves to nothing', async () => {
      const orphanId = new mongoose.Types.ObjectId().toString();
      await CouponV2.create(makeActiveCoupon({
        code: 'giftorphan',
        reward: {
          type: 'free_gift',
          gift_product_id: orphanId,
          gift_product_name: 'Fallback',
          gift_value_aed: 30,
        },
      }));

      const { verdict, discount } = await validate({ code: 'giftorphan', cart: { subtotal: 100 } });

      expect(verdict.eligible).toBe(true);
      expect(discount.meta).toMatchObject({
        product_id: orphanId,
        msrp_aed: 30,
      });
      // Optional enriched fields absent — hydration failed.
      expect('product_name' in discount.meta).toBe(false);
      expect('product_image' in discount.meta).toBe(false);
      expect('display_label' in discount.meta).toBe(false);
      // Storage-layer names stay off meta — wire contract guard.
      expect('gift_product_id' in discount.meta).toBe(false);
      expect('gift_product_name' in discount.meta).toBe(false);
    });
  });

  it('returns USER_CAP_REACHED when user already has active redemption', async () => {
    const coupon = await CouponV2.create(makeActiveCoupon({ code: 'usercap1', max_uses_user: 1 }));
    await CouponRedemption.create({
      coupon_id: coupon._id,
      phone_e164: '+971501234567',
      state: 'redeemed',
      discount_aed: 10,
      rule_version: 1,
      expires_at: new Date(Date.now() + 3600000),
    });

    const { verdict } = await validate({
      code: 'usercap1',
      phone: '+971501234567',
      cart: { subtotal: 100 },
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.USER_CAP_REACHED);
  });
});
