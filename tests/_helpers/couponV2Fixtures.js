'use strict';

/**
 * couponV2Fixtures — shared seeding helpers for v2 coupon route-level tests.
 *
 * Writes real documents to the in-memory MongoDB instance provided by
 * tests/setup.js. Helpers return the persisted documents so callers can
 * read back generated `_id`s, `code`s, etc.
 *
 * All helpers are additive: callers can pass overrides to tweak any field
 * without re-stating defaults. Each call creates its own document — no
 * shared state across tests, no implicit cleanup (setup.js drops
 * collections in afterEach).
 */

const CouponV2 = require('../../src/models/CouponV2');
const Product = require('../../src/models/Product');

/**
 * Seed a Product doc that the free_gift hydration path in validate.js will
 * resolve via `Product.findById(reward.gift_product_id)`.
 *
 * @param {object} [overrides]
 * @param {string} [overrides.name='Hydro Bottle']
 * @param {string} [overrides.imageUrl='https://cdn.example.com/bottle.jpg']
 * @param {Array<{id: string, name: string, qty?: number}>} [overrides.variantsData]
 * @param {number} [overrides.totalQty=50]
 * @returns {Promise<import('mongoose').Document>}
 */
async function seedGiftProduct(overrides = {}) {
  const name = overrides.name || 'Hydro Bottle';
  const imageUrl = overrides.imageUrl || 'https://cdn.example.com/bottle.jpg';
  const variantsData = overrides.variantsData || [{ id: 'v-500', name: '500 ml', qty: 20 }];
  return Product.create({
    product: {
      name,
      images: [{ sizes: { original: imageUrl } }],
    },
    variantsData,
    totalQty: overrides.totalQty != null ? overrides.totalQty : 50,
    status: true,
  });
}

/**
 * Seed a CouponV2 doc with sensible active-window defaults. The caller
 * provides reward + rules; everything else falls back to a permissive
 * always-on configuration that won't trip date/cap/status predicates.
 *
 * @param {object} opts
 * @param {string} opts.code
 * @param {object} opts.reward - reward config (storage shape)
 * @param {Array}  [opts.rules=[]]
 * @param {string} [opts.name]
 * @param {object} [opts.metadata]
 * @param {string} [opts.trigger='code']
 * @param {number} [opts.priority=0]
 * @param {number} [opts.max_uses_user=1]
 * @param {(number|null)} [opts.uses_remaining=null]
 * @returns {Promise<import('mongoose').Document>}
 */
async function seedCoupon(opts) {
  return CouponV2.create({
    code: opts.code,
    name: opts.name || opts.code,
    status: 'active',
    trigger: opts.trigger || 'code',
    max_uses_user: opts.max_uses_user != null ? opts.max_uses_user : 1,
    uses_remaining: opts.uses_remaining !== undefined ? opts.uses_remaining : null,
    reward: opts.reward,
    rules: opts.rules || [],
    rule_version: 1,
    priority: opts.priority || 0,
    metadata: opts.metadata || {},
  });
}

/**
 * Compose a free_gift coupon + its hydratable Product in one call.
 * Convenience for the common case in wire-shape tests.
 *
 * @param {object} opts
 * @param {string} opts.code
 * @param {number} [opts.gift_value_aed=49]
 * @param {string} [opts.giftName='Hydro Bottle']
 * @param {string} [opts.giftImageUrl]
 * @param {string} [opts.giftVariantId='v-500']
 * @param {string} [opts.gift_variant_name='500 ml']
 * @param {object} [opts.metadata]
 * @param {Array}  [opts.rules=[]]
 * @returns {Promise<{ coupon: import('mongoose').Document, product: import('mongoose').Document }>}
 */
async function seedFreeGiftCouponWithProduct(opts) {
  const giftValue = opts.gift_value_aed != null ? opts.gift_value_aed : 49;
  const product = await seedGiftProduct({
    name: opts.giftName,
    imageUrl: opts.giftImageUrl,
    variantsData: [{ id: opts.giftVariantId || 'v-500', name: opts.gift_variant_name || '500 ml', qty: 20 }],
  });
  const coupon = await seedCoupon({
    code: opts.code,
    reward: {
      type: 'free_gift',
      gift_product_id: product._id.toString(),
      gift_product_name: opts.giftName || 'Hydro Bottle',
      gift_value_aed: giftValue,
      gift_variant_id: opts.giftVariantId || 'v-500',
    },
    rules: opts.rules || [],
    metadata: opts.metadata || {},
  });
  return { coupon, product };
}

/**
 * Names that MUST NOT appear at the top level of a wire-reward object.
 *
 * Each is a storage-layer schema name that the wire contract renames or
 * relocates. Used by the parametrised cross-reward regression guard to
 * catch any reward class (current or future) leaking storage names.
 *
 * NOTE — `gift_product_id` and `gift_product_name` are intentionally NOT in
 * this list. The `FreeGiftReward` class deliberately emits both as legacy
 * aliases inside `discount.meta` alongside the canonical wire fields
 * (`product_id`, `product_name`) to keep internal v1-era consumers and
 * existing reward-class unit tests working during the v2 rollout. The
 * canonical wire names that mobile reads are `product_id` / `product_name`
 * and those are asserted as present in the consuming tests; the legacy
 * aliases appear as harmless duplicates and are documented as part of the
 * wire shape in COUPON_V2_IMPLEMENTATION.md's FreeGiftReward enrichment
 * section.
 *
 * If a future change drops those legacy aliases from FreeGiftReward
 * (cleaner long-term — reduces wire bytes and confusion), add them back
 * to this list to lock the cleanup in.
 */
const FORBIDDEN_STORAGE_NAMES = Object.freeze([
  // free_gift — storage names on CouponV2.reward (Mongoose schema). Wire
  // exposes only `product_id`, `msrp_aed`, and the optional enriched fields.
  // FreeGiftReward.apply() deliberately keeps storage names off `meta`, so
  // any appearance here means the serializer was bypassed.
  'gift_value_aed',
  'gift_product_id',
  'gift_product_name',
  // percent — storage variants seen historically; wire is `percent`.
  'percent_off',
  'pct_off',
  // flat / tiered — storage variants for cap and threshold; wire uses
  // `cap_aed` / `min_aed` / `min_subtotal` per reward class.
  'max_discount_aed',
  'subtotal_threshold',
  'min_subtotal_aed',
  // free_shipping — storage variant for scope; wire uses `shipping_waived_aed`.
  'shipping_scope',
]);

module.exports = {
  seedGiftProduct,
  seedCoupon,
  seedFreeGiftCouponWithProduct,
  FORBIDDEN_STORAGE_NAMES,
};
