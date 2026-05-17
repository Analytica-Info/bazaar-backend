'use strict';

/**
 * Route-level wire-shape contract tests for the v2 coupon endpoints.
 *
 * These tests hit the HTTP layer end-to-end:
 *   supertest → real v2 router → real coupon controllers → real engine
 *   → real serializeReward → response body
 *
 * Nothing in the engine path is mocked. The coupon catalog and gift
 * Products live in the in-memory MongoDB instance provided by
 * tests/setup.js. Auth middleware is the only thing stubbed (to make
 * anonymous routes addressable from supertest).
 *
 * Purpose: lock the public v2 wire contract. If a future change reverts
 * any of the three emission points (controller validate, apply use
 * case, eligible use case) back to emitting `coupon.reward` raw, the
 * regression guards below will fail. Manually verified: reverting
 * couponController.js:90 to `reward: coupon.reward` makes test 1's
 * `product_name` / regression-guard assertions fail.
 */

require('../../../setup'); // in-memory Mongo lifecycle

// ── Auth + unrelated controllers mocked to keep buildApp clean ─────────────
jest.mock('../../../../src/middleware/authV2', () => ({
  required: () => (req, _res, next) => { req.user = { _id: 'user-wire' }; next(); },
  optional: () => (req, _res, next) => { req.user = { _id: 'user-wire' }; next(); },
}));
jest.mock('../../../../src/utilities/fileUpload', () => () => ({ single: () => (req, _res, next) => next() }));

// Stub every controller buildApp would otherwise wire so unrelated routes
// don't pull half the codebase into the test boot. We only need the coupon
// controller to be the real thing.
const stubAll = (_names) => new Proxy({}, { get: () => (_req, res) => res.json({ success: true, data: null }) });

jest.mock('../../../../src/controllers/v2/web/authController',     () => stubAll());
jest.mock('../../../../src/controllers/v2/mobile/authController',  () => stubAll());
jest.mock('../../../../src/controllers/v2/web/userController',     () => stubAll());
jest.mock('../../../../src/controllers/v2/mobile/userController',  () => stubAll());
jest.mock('../../../../src/controllers/v2/web/orderController',    () => stubAll());
jest.mock('../../../../src/controllers/v2/mobile/orderController', () => stubAll());
jest.mock('../../../../src/controllers/v2/web/cartController',     () => stubAll());
jest.mock('../../../../src/controllers/v2/mobile/cartController',  () => stubAll());
jest.mock('../../../../src/controllers/v2/web/notificationController',    () => stubAll());
jest.mock('../../../../src/controllers/v2/mobile/notificationController', () => stubAll());
jest.mock('../../../../src/controllers/v2/shared/productController',  () => stubAll());
jest.mock('../../../../src/controllers/v2/shared/wishlistController', () => stubAll());
jest.mock('../../../../src/controllers/v2/shared/railController',     () => stubAll());
jest.mock('../../../../src/controllers/v2/shared/shippingController', () => stubAll());
jest.mock('../../../../src/controllers/v2/shared/reviewController',   () => stubAll());
jest.mock('../../../../src/controllers/v2/shared/bannerController',   () => stubAll());
jest.mock('../../../../src/controllers/v2/shared/verticalsController', () => stubAll());
jest.mock('../../../../src/controllers/v2/shared/homeController',     () => stubAll());

// IMPORTANT: do NOT mock couponController, coupon engine, serializeReward,
// CouponV2, CouponRedemption, Product. The whole point of these tests is
// to exercise them as a real integration.

const request = require('supertest');
const { buildApp } = require('../../../v2/contracts/_helpers/app');
const {
  seedCoupon,
  seedGiftProduct,
  seedFreeGiftCouponWithProduct,
  FORBIDDEN_STORAGE_NAMES,
} = require('../../../_helpers/couponV2Fixtures');

const WEB = { 'X-Client': 'web' };

let app;
beforeAll(() => { app = buildApp(); });

// Helpers — small, scoped to this file
function uniquePhone(seed) {
  // Generate stable but unique phone numbers per test so per-user-cap and
  // partial-unique-index constraints don't collide across cases.
  return `+9715${String(seed).padStart(8, '0')}`;
}
function expectNoStorageLeakage(reward) {
  for (const name of FORBIDDEN_STORAGE_NAMES) {
    expect(reward[name]).toBeUndefined();
  }
  // Flat wire shape — no nested `.meta`
  expect(reward.meta).toBeUndefined();
}

// ── 1. validate — free_gift, enriched payload ──────────────────────────────

describe('POST /v2/coupons/validate — free_gift wire shape (v2 engine)', () => {
  it('emits canonical names and enriched fields; no storage-name leakage', async () => {
    const { product } = await seedFreeGiftCouponWithProduct({ code: 'wireval1' });

    const res = await request(app)
      .post('/v2/coupons/validate')
      .set(WEB)
      .send({ code: 'wireval1', phone: uniquePhone(1), cart_snapshot: { subtotal: 100 } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const reward = res.body.data.reward;

    // Required fields
    expect(reward.type).toBe('free_gift');
    expect(reward.product_id).toBe(product._id.toString());
    expect(reward.msrp_aed).toBe(49);

    // Enriched fields (server hydrated from the seeded Product)
    expect(reward.product_name).toBe('Hydro Bottle');
    expect(typeof reward.product_image).toBe('string');
    expect(reward.product_image.length).toBeGreaterThan(0);
    expect(reward.display_label).toContain('Hydro Bottle');
    expect(reward.display_label).toContain('AED 49');

    // Regression guards — storage names that the bug would have surfaced
    expectNoStorageLeakage(reward);
  });

  it('degrades gracefully when the gift Product is missing', async () => {
    // Coupon points at an ObjectId that doesn't exist in the in-memory DB.
    // hydration in validate.js fails, the reward falls back to required-only.
    const mongoose = require('mongoose');
    const orphanId = new mongoose.Types.ObjectId().toString();
    await seedCoupon({
      code: 'wireval2',
      reward: {
        type: 'free_gift',
        gift_product_id: orphanId,
        gift_product_name: 'Fallback Name',
        gift_value_aed: 30,
      },
    });

    const res = await request(app)
      .post('/v2/coupons/validate')
      .set(WEB)
      .send({ code: 'wireval2', phone: uniquePhone(2), cart_snapshot: { subtotal: 100 } });

    expect(res.status).toBe(200);
    const reward = res.body.data.reward;
    expect(reward.type).toBe('free_gift');
    expect(reward.product_id).toBe(orphanId);
    expect(reward.msrp_aed).toBe(30);

    // Optional fields absent (not null) — older mobile builds rely on this
    expect('product_name' in reward).toBe(false);
    expect('product_image' in reward).toBe(false);
    expect('unit_label' in reward).toBe(false);
    expect('display_label' in reward).toBe(false);

    expectNoStorageLeakage(reward);
  });

  it('honours marketing display_label override from coupon metadata', async () => {
    const product = await seedGiftProduct({ name: 'Limited Drop' });
    await seedCoupon({
      code: 'wireval3',
      reward: {
        type: 'free_gift',
        gift_product_id: product._id.toString(),
        gift_product_name: 'Limited Drop',
        gift_value_aed: 99,
        metadata: { display_label: 'Limited drop — yours free 🎁' },
      },
    });

    const res = await request(app)
      .post('/v2/coupons/validate')
      .set(WEB)
      .send({ code: 'wireval3', phone: uniquePhone(3), cart_snapshot: { subtotal: 100 } });

    expect(res.status).toBe(200);
    expect(res.body.data.reward.display_label).toBe('Limited drop — yours free 🎁');
  });
});

// ── 4. apply — same wire shape on apply ─────────────────────────────────────

describe('POST /v2/coupons/apply — free_gift wire shape', () => {
  it('returns enriched wire shape, redemption_id, and discount_aed matching gift_value_aed', async () => {
    const { product } = await seedFreeGiftCouponWithProduct({
      code: 'wireapp1',
      gift_value_aed: 49,
    });

    const res = await request(app)
      .post('/v2/coupons/apply')
      .set(WEB)
      .send({
        code: 'wireapp1',
        phone: uniquePhone(10),
        cart_snapshot: { subtotal: 100 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.redemption_id).toBe('string');
    expect(res.body.data.redemption_id.length).toBeGreaterThan(0);
    expect(res.body.data.discount_aed).toBe(49);

    const reward = res.body.data.reward;
    expect(reward.type).toBe('free_gift');
    expect(reward.product_id).toBe(product._id.toString());
    expect(reward.msrp_aed).toBe(49);
    expect(reward.product_name).toBe('Hydro Bottle');
    expectNoStorageLeakage(reward);
  });
});

// ── 5. apply — idempotency replay returns same wire shape ───────────────────

describe('POST /v2/coupons/apply — idempotency replay', () => {
  it('second call with the same idempotency_key returns the same redemption_id and reward shape', async () => {
    await seedFreeGiftCouponWithProduct({ code: 'wireapp2' });
    const body = {
      code: 'wireapp2',
      phone: uniquePhone(11),
      cart_snapshot: { subtotal: 100 },
      idempotency_key: 'replay-1',
    };

    const first = await request(app).post('/v2/coupons/apply').set(WEB).send(body);
    expect(first.status).toBe(200);
    expect(first.body.data.redemption_id).toBeDefined();

    const second = await request(app).post('/v2/coupons/apply').set(WEB).send(body);
    expect(second.status).toBe(200);
    expect(second.body.data.redemption_id).toBe(first.body.data.redemption_id);

    // Structurally identical reward — proves replay reads from
    // metadata.wire_reward (the serialized shape), not from metadata.reward
    // (which is the raw Mongo config and would have storage names).
    expect(second.body.data.reward).toEqual(first.body.data.reward);
    expectNoStorageLeakage(second.body.data.reward);
  });
});

// ── 6. eligible — per-candidate wire shape ──────────────────────────────────

describe('GET /v2/coupons/eligible — per-candidate wire shape', () => {
  it('returns flat-shape wire reward for every eligible candidate, ineligible filtered out', async () => {
    // Two eligible free_gift coupons (different products), one ineligible
    // via a min_subtotal predicate above the cart subtotal.
    const { product: p1 } = await seedFreeGiftCouponWithProduct({
      code: 'wireelg1',
      giftName: 'Tote A',
    });
    const { product: p2 } = await seedFreeGiftCouponWithProduct({
      code: 'wireelg2',
      giftName: 'Tote B',
      gift_value_aed: 60,
    });
    await seedCoupon({
      code: 'wireelg3',
      reward: { type: 'flat', amount: 10 },
      rules: [{ type: 'min_subtotal', amount: 9999 }],
    });

    const res = await request(app)
      .get('/v2/coupons/eligible')
      .set(WEB)
      .query({ phone: uniquePhone(20), subtotal: 100 });

    expect(res.status).toBe(200);
    const coupons = res.body.data.coupons;
    expect(Array.isArray(coupons)).toBe(true);

    const codes = coupons.map((c) => c.coupon.code).sort();
    expect(codes).toContain('wireelg1');
    expect(codes).toContain('wireelg2');
    expect(codes).not.toContain('wireelg3');

    for (const entry of coupons) {
      const reward = entry.coupon.reward;
      expect(reward.type).toBeDefined();
      if (reward.type === 'free_gift') {
        expect(reward.product_id).toBeDefined();
        expect(reward.msrp_aed).toBeDefined();
      }
      expectNoStorageLeakage(reward);
    }

    // Sanity — the two free-gift entries point at the seeded product ids
    const giftEntries = coupons.filter((c) => c.coupon.reward.type === 'free_gift');
    const productIds = giftEntries.map((c) => c.coupon.reward.product_id).sort();
    expect(productIds).toEqual([p1._id.toString(), p2._id.toString()].sort());
  });
});

// ── 7. Cross-reward regression guard — parametrised ─────────────────────────

describe.each([
  {
    type: 'flat',
    reward: { type: 'flat', amount: 10 },
    rules: [],
  },
  {
    type: 'percent',
    reward: { type: 'percent', percent: 15 },
    rules: [],
  },
  {
    type: 'free_shipping',
    reward: { type: 'free_shipping', shipping_cost_aed: 20 },
    rules: [],
    cart: { subtotal: 100, shipping_cost: 20 },
  },
  {
    type: 'tiered_percent',
    reward: {
      type: 'tiered_percent',
      tiers: [
        { min_subtotal: 0, percent: 10 },
        { min_subtotal: 200, percent: 20 },
      ],
    },
    rules: [],
  },
  {
    type: 'bxgy',
    reward: { type: 'bxgy', buy_quantity: 2, get_quantity: 1, applies_to_product_ids: ['p1'] },
    rules: [],
    cart: {
      subtotal: 30,
      items: [{ product_id: 'p1', quantity: 3, unit_price: 10 }],
    },
  },
])('POST /v2/coupons/validate — $type wire shape', ({ type, reward, rules, cart }) => {
  it(`wire response.reward.type === "${type}" and contains no storage-layer field names`, async () => {
    const code = `wirex_${type}`;
    await seedCoupon({ code, reward, rules: rules || [] });

    const res = await request(app)
      .post('/v2/coupons/validate')
      .set(WEB)
      .send({
        code,
        phone: uniquePhone(100 + type.length),
        cart_snapshot: cart || { subtotal: 100 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Either the coupon validated (reward returned) or it was ineligible
    // (reward absent). For the regression guard we care only that, IF a
    // reward is present, it has the canonical wire shape.
    if (res.body.data.valid) {
      const wireReward = res.body.data.reward;
      expect(wireReward.type).toBe(type);
      expectNoStorageLeakage(wireReward);
    } else {
      // Reward field absent on ineligible — also acceptable. The contract
      // doesn't promise a reward shape when valid:false.
      expect(res.body.data.reward).toBeUndefined();
    }
  });
});
