'use strict';

/**
 * cart-threshold-gift-v2.js — one-time idempotent seed script.
 *
 * Creates (or updates) a CouponV2 document that mirrors the existing legacy
 * cart-threshold gift configuration so the v2 engine can take over once the
 * CART_GIFT_V2_ENABLED flag is flipped in staging.
 *
 * Safe to run multiple times — upsert keyed on { code: '__cart_gift_threshold__' }.
 *
 * Usage:
 *   MONGODB_URI=mongodb://... node scripts/seed/cart-threshold-gift-v2.js
 */

const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[seed] ERROR: MONGODB_URI env var is required');
    process.exit(1);
  }

  await mongoose.connect(uri);

  // Lazy-require models AFTER connecting so Mongoose connection is live.
  const Product = require('../../src/models/Product');
  const CouponV2 = require('../../src/models/CouponV2');

  // 1. Find the current gift product
  const giftProduct = await Product.findOne({ isGift: true }).lean();
  if (!giftProduct) {
    console.error('[seed] ERROR: No product with isGift=true found. Aborting.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // 2. Read threshold (fall back to 400 if missing)
  const giftThreshold =
    giftProduct.giftThreshold != null ? Number(giftProduct.giftThreshold) : 400;

  const giftProductName = giftProduct.product?.name || 'Gift';
  const giftVariantId = giftProduct.giftVariantId || null;

  // 3. Build the document payload
  const now = new Date();
  const payload = {
    code: '__cart_gift_threshold__',
    trigger: 'cart_render',
    name: 'Cart Threshold Free Gift',
    status: 'active',
    priority: 100,
    stack_group: 'gift',
    stackable: true,
    starts_at: now,
    ends_at: new Date('2099-12-31'),
    max_uses_total: null,
    max_uses_user: null,
    reward: {
      type: 'free_gift',
      gift_product_id: giftProduct._id.toString(),
      gift_variant_id: giftVariantId,
      gift_product_name: giftProductName,
      gift_value_aed: 0,
    },
    rules: [
      { type: 'min_subtotal', amount: giftThreshold },
      {
        type: 'gift_in_stock',
        gift_product_id: giftProduct._id.toString(),
        min_buffer: 5,
      },
    ],
    metadata: {
      slot: 'cart_threshold_gift',
      migrated_from: 'legacy_isGift_flag',
      migrated_at: now,
    },
    created_by: 'script:cart-threshold-gift-v2',
  };

  // 4. Upsert — idempotent on code
  const filter = { code: '__cart_gift_threshold__' };
  const existing = await CouponV2.findOne(filter).lean();

  if (!existing) {
    await CouponV2.create(payload);
    console.log(`[seed] Created CouponV2 __cart_gift_threshold__ (threshold=AED ${giftThreshold}, gift="${giftProductName}")`);
  } else {
    const updated = await CouponV2.findOneAndUpdate(
      filter,
      { $set: { ...payload, metadata: { ...payload.metadata, migrated_at: now } } },
      { new: true },
    ).lean();

    // Simple change detection: compare threshold and gift product id
    const prevThreshold = (existing.rules || []).find((r) => r.type === 'min_subtotal')?.amount;
    const prevGiftId = existing.reward?.gift_product_id;
    const newGiftId = giftProduct._id.toString();

    if (prevThreshold === giftThreshold && prevGiftId === newGiftId) {
      console.log(`[seed] No change — __cart_gift_threshold__ already up to date`);
    } else {
      console.log(
        `[seed] Updated __cart_gift_threshold__ ` +
        `(threshold: ${prevThreshold} → ${giftThreshold}, gift: ${prevGiftId} → ${newGiftId})`,
      );
    }
  }

  await mongoose.disconnect();
}

/* istanbul ignore next */
if (require.main === module) {
  run().catch((err) => {
    console.error('[seed] Unexpected error:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
}

module.exports = { run };
