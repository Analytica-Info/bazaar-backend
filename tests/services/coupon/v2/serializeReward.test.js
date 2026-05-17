'use strict';

/**
 * Unit tests for serializeReward — the storage→wire translator that lives
 * between RewardClass.apply() output and any public-facing controller/use-case
 * response.
 *
 * The wire contract is FLAT: { type, ...payload }. No nested .meta. No
 * storage-layer schema names.
 */

const { serializeReward } = require('../../../../src/services/coupon/wire/serializeReward');
const AppliedDiscount = require('../../../../src/services/coupon/domain/AppliedDiscount');

describe('serializeReward', () => {
  it('returns null on null input', () => {
    expect(serializeReward(null)).toBeNull();
  });

  it('returns null on undefined input', () => {
    expect(serializeReward(undefined)).toBeNull();
  });

  it('returns null when the discount has no type', () => {
    expect(serializeReward({ meta: { foo: 'bar' } })).toBeNull();
  });

  it('produces a flat shape with type at top level (no nested .meta)', () => {
    const d = new AppliedDiscount({ aed: 10, type: 'flat', meta: { amount_aed: 10 } });
    const wire = serializeReward(d);
    expect(wire).toEqual({ type: 'flat', amount_aed: 10 });
    expect(wire.meta).toBeUndefined();
  });

  describe('per reward type', () => {
    it('flat: { type, amount_aed }', () => {
      const d = new AppliedDiscount({ aed: 25, type: 'flat', meta: { amount_aed: 25 } });
      expect(serializeReward(d)).toEqual({ type: 'flat', amount_aed: 25 });
    });

    it('percent: { type, percent }', () => {
      const d = new AppliedDiscount({ aed: 15, type: 'percent', meta: { percent: 15 } });
      expect(serializeReward(d)).toEqual({ type: 'percent', percent: 15 });
    });

    it('free_shipping: { type, shipping_waived_aed }', () => {
      const d = new AppliedDiscount({ aed: 20, type: 'free_shipping', meta: { shipping_waived_aed: 20 } });
      const wire = serializeReward(d);
      expect(wire.type).toBe('free_shipping');
      expect(wire.shipping_waived_aed).toBe(20);
    });

    it('tiered_percent: { type, tier_applied, percent }', () => {
      const d = new AppliedDiscount({
        aed: 30,
        type: 'tiered_percent',
        meta: { tier_applied: 2, percent: 20 },
      });
      const wire = serializeReward(d);
      expect(wire).toMatchObject({ type: 'tiered_percent', tier_applied: 2, percent: 20 });
    });

    it('bxgy: { type, free_units }', () => {
      const d = new AppliedDiscount({
        aed: 50,
        type: 'bxgy',
        meta: { free_units: [{ product_id: 'p1', quantity: 1 }] },
      });
      const wire = serializeReward(d);
      expect(wire.type).toBe('bxgy');
      expect(wire.free_units).toEqual([{ product_id: 'p1', quantity: 1 }]);
    });

    it('free_gift (minimal): required fields only when hydration is absent', () => {
      const d = new AppliedDiscount({
        aed: 30,
        type: 'free_gift',
        meta: {
          product_id: 'g1',
          msrp_aed: 30,
          // legacy aliases — present in meta but should not be filtered out;
          // reward classes own what they emit. The serializer flattens verbatim.
          gift_product_id: 'g1',
          gift_product_name: 'Fallback',
        },
      });
      const wire = serializeReward(d);
      expect(wire).toMatchObject({ type: 'free_gift', product_id: 'g1', msrp_aed: 30 });
      // Optional enrichment absent
      expect('product_name' in wire).toBe(false);
      expect('product_image' in wire).toBe(false);
      expect('unit_label' in wire).toBe(false);
      expect('display_label' in wire).toBe(false);
    });

    it('free_gift (enriched): all optional fields surface when meta has them', () => {
      const d = new AppliedDiscount({
        aed: 49,
        type: 'free_gift',
        meta: {
          product_id: 'g1',
          msrp_aed: 49,
          product_name: 'Hydro Bottle',
          product_image: 'https://cdn.example.com/bottle.jpg',
          unit_label: '500 ml',
          display_label: 'Free Hydro Bottle 🎁',
          gift_product_id: 'g1',
          gift_product_name: 'Hydro Bottle',
        },
      });
      const wire = serializeReward(d);
      expect(wire).toMatchObject({
        type: 'free_gift',
        product_id: 'g1',
        msrp_aed: 49,
        product_name: 'Hydro Bottle',
        product_image: 'https://cdn.example.com/bottle.jpg',
        unit_label: '500 ml',
        display_label: 'Free Hydro Bottle 🎁',
      });
    });
  });

  describe('regression guards (storage-name leakage)', () => {
    // These ASSERT that names that exist in the underlying CouponV2.reward
    // Mongo config — but which the reward classes' apply() output renames
    // for the wire — never escape. If a future reward class mistakenly
    // copies storage names into discount.meta, these tests still pass
    // (serializer is a transparent flattener); the reward-class tests catch
    // that case. These guards are here so that *if* something passes raw
    // storage-config into serializeReward by accident, the existing wire
    // structure stays predictable.

    it('free_gift wire does not contain gift_value_aed (storage name)', () => {
      const d = new AppliedDiscount({
        aed: 49,
        type: 'free_gift',
        meta: { product_id: 'g1', msrp_aed: 49 }, // FreeGiftReward never emits gift_value_aed in meta
      });
      const wire = serializeReward(d);
      expect(wire.gift_value_aed).toBeUndefined();
    });

    it('serializer is a pure flattener — no meta wrapping, no extra keys', () => {
      const d = new AppliedDiscount({ aed: 10, type: 'flat', meta: { amount_aed: 10 } });
      const wire = serializeReward(d);
      // Only `type` and the spread-in meta keys
      expect(Object.keys(wire).sort()).toEqual(['amount_aed', 'type']);
    });
  });

  describe('defensive cases', () => {
    it('handles missing meta gracefully', () => {
      const d = { type: 'flat' };
      expect(serializeReward(d)).toEqual({ type: 'flat' });
    });

    it('handles non-object meta gracefully', () => {
      const d = { type: 'flat', meta: 'not-an-object' };
      expect(serializeReward(d)).toEqual({ type: 'flat' });
    });

    it('type cannot be overridden by meta — the canonical discount.type always wins', () => {
      // If a reward class accidentally puts `type` inside its own meta object,
      // the public wire MUST still report the discount's canonical type.
      const d = { type: 'flat', meta: { type: 'percent', amount_aed: 5 } };
      const wire = serializeReward(d);
      expect(wire.type).toBe('flat');
      expect(wire.amount_aed).toBe(5);
    });
  });
});
