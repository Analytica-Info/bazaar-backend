require('../../../setup');
'use strict';

/**
 * Reward unit tests — one describe block per reward class.
 */

const AppliedDiscount = require('../../../../src/services/coupon/domain/AppliedDiscount');

require('../../../../src/services/coupon/rewards/index');

const FlatReward = require('../../../../src/services/coupon/rewards/FlatReward');
const PercentReward = require('../../../../src/services/coupon/rewards/PercentReward');
const FreeShippingReward = require('../../../../src/services/coupon/rewards/FreeShippingReward');
const TieredPercentReward = require('../../../../src/services/coupon/rewards/TieredPercentReward');
const BxGyReward = require('../../../../src/services/coupon/rewards/BxGyReward');
const FreeGiftReward = require('../../../../src/services/coupon/rewards/FreeGiftReward');

// ── FlatReward ────────────────────────────────────────────────────

describe('FlatReward', () => {
  it('returns the configured flat amount', () => {
    const d = FlatReward.apply({ type: 'flat', amount: 25 }, { subtotal: 200 });
    expect(d.aed).toBe(25);
    expect(d.type).toBe('flat');
  });

  it('clamps to subtotal — never negative', () => {
    const d = FlatReward.apply({ type: 'flat', amount: 300 }, { subtotal: 50 });
    expect(d.aed).toBe(50);
  });

  it('returns 0 when subtotal is 0', () => {
    const d = FlatReward.apply({ type: 'flat', amount: 25 }, { subtotal: 0 });
    expect(d.aed).toBe(0);
  });

  it('returns AppliedDiscount instance', () => {
    const d = FlatReward.apply({ type: 'flat', amount: 10 }, { subtotal: 100 });
    expect(d).toBeInstanceOf(AppliedDiscount);
  });
});

// ── PercentReward ─────────────────────────────────────────────────

describe('PercentReward', () => {
  it('computes correct percent discount', () => {
    const d = PercentReward.apply({ type: 'percent', percent: 10 }, { subtotal: 200 });
    expect(d.aed).toBe(20);
  });

  it('respects cap_aed', () => {
    const d = PercentReward.apply({ type: 'percent', percent: 15, cap_aed: 30 }, { subtotal: 500 });
    // 15% of 500 = 75, capped at 30
    expect(d.aed).toBe(30);
  });

  it('returns uncapped amount when below cap', () => {
    const d = PercentReward.apply({ type: 'percent', percent: 15, cap_aed: 30 }, { subtotal: 100 });
    // 15% of 100 = 15, below cap of 30
    expect(d.aed).toBe(15);
  });

  it('stores percent and cap in meta', () => {
    const d = PercentReward.apply({ type: 'percent', percent: 20, cap_aed: 50 }, { subtotal: 100 });
    expect(d.meta.percent).toBe(20);
    expect(d.meta.cap_aed).toBe(50);
  });
});

// ── FreeShippingReward ────────────────────────────────────────────

describe('FreeShippingReward', () => {
  it('waives the full shipping cost', () => {
    const d = FreeShippingReward.apply({ type: 'free_shipping' }, { shipping_cost: 15 });
    expect(d.aed).toBe(15);
    expect(d.type).toBe('free_shipping');
  });

  it('returns 0 when no shipping cost', () => {
    const d = FreeShippingReward.apply({ type: 'free_shipping' }, { shipping_cost: 0 });
    expect(d.aed).toBe(0);
  });

  it('respects max_shipping_aed cap', () => {
    const d = FreeShippingReward.apply(
      { type: 'free_shipping', max_shipping_aed: 10 },
      { shipping_cost: 25 }
    );
    expect(d.aed).toBe(10);
  });

  it('returns shipping amount when no cart shipping_cost', () => {
    const d = FreeShippingReward.apply({ type: 'free_shipping' }, {});
    expect(d.aed).toBe(0);
  });
});

// ── TieredPercentReward ───────────────────────────────────────────

describe('TieredPercentReward', () => {
  const tiers = [
    { min_subtotal: 100, percent: 5 },
    { min_subtotal: 200, percent: 10, cap_aed: 50 },
    { min_subtotal: 500, percent: 20 },
  ];
  const config = { type: 'tiered_percent', tiers };

  it('picks the highest applicable tier', () => {
    // subtotal 250 → tier 200 applies (10%)
    const d = TieredPercentReward.apply(config, { subtotal: 250 });
    expect(d.meta.percent).toBe(10);
    expect(d.aed).toBe(25); // 10% of 250
  });

  it('applies cap on the matching tier', () => {
    const d = TieredPercentReward.apply(config, { subtotal: 700 });
    // tier 500 → 20% of 700 = 140, no cap
    expect(d.aed).toBe(140);
  });

  it('returns 0 when subtotal is below lowest tier', () => {
    const d = TieredPercentReward.apply(config, { subtotal: 50 });
    expect(d.aed).toBe(0);
    expect(d.meta.tier).toBeNull();
  });

  it('picks tier at exact boundary', () => {
    const d = TieredPercentReward.apply(config, { subtotal: 200 });
    // exactly at 200 → tier 200 (10%)
    expect(d.meta.percent).toBe(10);
  });
});

// ── BxGyReward ────────────────────────────────────────────────────

describe('BxGyReward', () => {
  const items = [
    { product_id: 'p1', quantity: 2, unit_price: 30 },
    { product_id: 'p2', quantity: 1, unit_price: 20 },
  ];

  it('buy 2 get 1 free — cheapest item is free', () => {
    const d = BxGyReward.apply({ type: 'bxgy', buy_quantity: 2, get_quantity: 1 }, { items });
    // cheapest unit is 20 AED
    expect(d.aed).toBe(20);
    expect(d.type).toBe('bxgy');
  });

  it('returns 0 if not enough items to trigger deal', () => {
    const d = BxGyReward.apply(
      { type: 'bxgy', buy_quantity: 5, get_quantity: 1 },
      { items: [{ product_id: 'p1', quantity: 2, unit_price: 10 }] }
    );
    expect(d.aed).toBe(0);
  });

  it('restricts free items to get_product_ids', () => {
    const d = BxGyReward.apply(
      { type: 'bxgy', buy_quantity: 1, get_quantity: 1, get_product_ids: ['p2'] },
      { items }
    );
    // Only p2 (20 AED) is eligible for free
    expect(d.aed).toBe(20);
  });

  it('returns 0 when get_product_ids do not match any item', () => {
    const d = BxGyReward.apply(
      { type: 'bxgy', buy_quantity: 1, get_quantity: 1, get_product_ids: ['p99'] },
      { items }
    );
    expect(d.aed).toBe(0);
  });
});

// ── FreeGiftReward ────────────────────────────────────────────────

describe('FreeGiftReward', () => {
  const logger = require('../../../../src/utilities/logger');

  beforeEach(() => {
    if (logger.warn && logger.warn.mockClear) logger.warn.mockClear();
  });

  // ── existing required-shape contract ─────────────────────────────

  it('returns gift line with correct AED value and required-field shape', () => {
    const config = {
      type: 'free_gift',
      gift_product_id: 'gift1',
      gift_product_name: 'Sample Gift',
      gift_value_aed: 49.99,
    };
    const d = FreeGiftReward.apply(config, {});
    expect(d.aed).toBeCloseTo(49.99, 2);
    expect(d.type).toBe('free_gift');
    // Subset match — extra enriched keys are allowed alongside the required set.
    expect(d.meta).toMatchObject({
      product_id: 'gift1',
      msrp_aed: 49.99,
    });
    // Storage-layer names must NOT appear on meta — they would leak to the
    // wire response via serializeReward and break the public v2 contract.
    expect(d.meta.gift_product_id).toBeUndefined();
    expect(d.meta.gift_product_name).toBeUndefined();
    expect(d.meta.gift_value_aed).toBeUndefined();
  });

  it('returns 0 when gift_value_aed is 0', () => {
    const d = FreeGiftReward.apply(
      { type: 'free_gift', gift_product_id: 'g1', gift_product_name: 'Free', gift_value_aed: 0 },
      {}
    );
    expect(d.aed).toBe(0);
    expect(d.meta.msrp_aed).toBe(0);
  });

  // ── enriched-shape (hydrated giftProduct supplied via ctx) ───────

  it('hydrates product_name, product_image, unit_label, and auto-builds display_label', () => {
    const config = {
      type: 'free_gift',
      gift_product_id: 'gift1',
      gift_value_aed: 49,
      gift_variant_id: 'v-500',
    };
    const giftProduct = {
      _id: 'gift1',
      product: {
        name: 'Glass Bottle',
        images: [{ sizes: { original: 'https://cdn.example.com/bottle.jpg' } }],
      },
      variantsData: [
        { id: 'v-500', name: '500 ml', qty: 20 },
        { id: 'v-1000', name: '1 L', qty: 5 },
      ],
      giftVariantId: 'v-500',
    };
    const d = FreeGiftReward.apply(config, { giftProduct });
    expect(d.meta).toMatchObject({
      product_id: 'gift1',
      msrp_aed: 49,
      product_name: 'Glass Bottle',
      product_image: 'https://cdn.example.com/bottle.jpg',
      unit_label: '500 ml',
      display_label: 'Free Glass Bottle (worth AED 49)',
    });
    // Storage-layer names stay out of meta — wire contract guard.
    expect(d.meta.gift_product_id).toBeUndefined();
    expect(d.meta.gift_product_name).toBeUndefined();
  });

  it('omits optional fields when hydration is absent (lookup failed upstream)', () => {
    const config = {
      type: 'free_gift',
      gift_product_id: 'gift1',
      gift_product_name: 'Fallback Name',
      gift_value_aed: 30,
    };
    const d = FreeGiftReward.apply(config, {});
    // When hydration is absent, only the required wire fields land on meta.
    expect(d.meta).toEqual({
      product_id: 'gift1',
      msrp_aed: 30,
    });
    // Specifically: none of the optional keys are present (not even null)
    expect('product_name' in d.meta).toBe(false);
    expect('product_image' in d.meta).toBe(false);
    expect('unit_label' in d.meta).toBe(false);
    expect('display_label' in d.meta).toBe(false);
    // Storage names stay out (wire contract guard).
    expect('gift_product_id' in d.meta).toBe(false);
    expect('gift_product_name' in d.meta).toBe(false);
  });

  it('honors explicit display_label on coupon config (wins over auto-built)', () => {
    const config = {
      type: 'free_gift',
      gift_product_id: 'gift1',
      gift_value_aed: 99,
      display_label: 'Marketing-authored copy here',
    };
    const giftProduct = { product: { name: 'Some Product' } };
    const d = FreeGiftReward.apply(config, { giftProduct });
    expect(d.meta.display_label).toBe('Marketing-authored copy here');
  });

  it('honors display_label nested under metadata (admin-editable path)', () => {
    const config = {
      type: 'free_gift',
      gift_product_id: 'gift1',
      gift_value_aed: 99,
      metadata: { display_label: 'Tier 2 gift — limited stock' },
    };
    const giftProduct = { product: { name: 'Some Product' } };
    const d = FreeGiftReward.apply(config, { giftProduct });
    expect(d.meta.display_label).toBe('Tier 2 gift — limited stock');
  });

  it('omits product_image when product has no usable image source', () => {
    const config = { type: 'free_gift', gift_product_id: 'g1', gift_value_aed: 10 };
    const giftProduct = { product: { name: 'No Photo' } };
    const d = FreeGiftReward.apply(config, { giftProduct });
    expect(d.meta.product_name).toBe('No Photo');
    expect('product_image' in d.meta).toBe(false);
  });

  it('omits unit_label when variant name is the catch-all "Default"', () => {
    const config = { type: 'free_gift', gift_product_id: 'g1', gift_value_aed: 10 };
    const giftProduct = {
      product: { name: 'Plain Item' },
      variantsData: [{ id: 'v1', name: 'Default', qty: 5 }],
    };
    const d = FreeGiftReward.apply(config, { giftProduct });
    expect('unit_label' in d.meta).toBe(false);
  });

  it('falls back to image url when sizes.original is absent', () => {
    const config = { type: 'free_gift', gift_product_id: 'g1', gift_value_aed: 10 };
    const giftProduct = {
      product: { name: 'X', images: [{ url: 'https://cdn.example.com/x.jpg' }] },
    };
    const d = FreeGiftReward.apply(config, { giftProduct });
    expect(d.meta.product_image).toBe('https://cdn.example.com/x.jpg');
  });

  it('still composes display_label when msrp_aed is 0', () => {
    const config = { type: 'free_gift', gift_product_id: 'g1', gift_value_aed: 0 };
    const giftProduct = { product: { name: 'Free Sample' } };
    const d = FreeGiftReward.apply(config, { giftProduct });
    // 0 is documented as a valid (if unusual) gift-with-purchase config — see code comment.
    expect(d.meta.display_label).toBe('Free Free Sample (worth AED 0)');
  });

  it('uses first variant when neither config.gift_variant_id nor giftVariantId is set', () => {
    const config = { type: 'free_gift', gift_product_id: 'g1', gift_value_aed: 10 };
    const giftProduct = {
      product: { name: 'X' },
      variantsData: [{ id: 'v1', name: '250 g' }, { id: 'v2', name: '500 g' }],
    };
    const d = FreeGiftReward.apply(config, { giftProduct });
    expect(d.meta.unit_label).toBe('250 g');
  });

  it('does not throw when giftProduct shape is malformed', () => {
    const config = { type: 'free_gift', gift_product_id: 'g1', gift_value_aed: 10 };
    const malformed = { product: null, variantsData: 'not-an-array' };
    expect(() => FreeGiftReward.apply(config, { giftProduct: malformed })).not.toThrow();
  });
});
