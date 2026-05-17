'use strict';

/**
 * Backfill FIRST15 coupon into coupons_v2.
 *
 * FIRST15 config:
 *   - reward: percent(15, cap=30 AED)
 *   - rules: first_order + min_subtotal(100) + max_uses_user=1
 *
 * Idempotent: safe to re-run; logs "already present" if FIRST15 exists.
 *
 * Usage (up):
 *   MONGODB_URI=mongodb://... node scripts/migrations/2026-05-coupon-v2-backfill.js
 *
 * Rollback (down):
 *   MONGODB_URI=mongodb://... node -e "require('./scripts/migrations/2026-05-coupon-v2-backfill').rollback()"
 */

const mongoose = require('mongoose');
const CouponV2 = require('../../src/models/CouponV2');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/bazaar';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('[backfill] Connected to MongoDB');

  const existing = await CouponV2.findOne({ code: 'first15' }).lean();

  if (existing) {
    console.log('[backfill] FIRST15 already present in coupons_v2 — skipping.');
    await mongoose.disconnect();
    return { skipped: true };
  }

  const doc = await CouponV2.create({
    code: 'first15',
    name: 'FIRST15',
    title: '15% off your first order',
    description: 'Get 15% off your first order (up to AED 30) on orders over AED 100.',
    status: 'active',
    starts_at: null,
    ends_at: null,
    max_uses_total: null,
    uses_remaining: null,
    max_uses_user: 1,
    rules: [
      { type: 'first_order' },
      { type: 'min_subtotal', amount: 100 },
    ],
    reward: {
      type: 'percent',
      percent: 15,
      cap_aed: 30,
    },
    priority: 10,
    metadata: { backfilled_by: '2026-05-coupon-v2-backfill', backfilled_at: new Date().toISOString() },
    rule_version: 1,
    created_by: 'migration',
  });

  console.log(`[backfill] FIRST15 inserted with _id=${doc._id}`);
  await mongoose.disconnect();
  return { inserted: true, id: doc._id.toString() };
}

async function rollback() {
  await mongoose.connect(MONGO_URI);
  console.log('[backfill:rollback] Connected to MongoDB');

  const result = await CouponV2.deleteMany({ code: 'first15', created_by: 'migration' });
  console.log(`[backfill:rollback] Deleted ${result.deletedCount} document(s) with code=first15`);

  await mongoose.disconnect();
  return { deleted: result.deletedCount };
}

module.exports = { run, rollback };

// Run automatically only when executed directly (not when required as a module).
if (require.main === module) {
  run().then((result) => {
    console.log('[backfill] Done:', result);
    process.exit(0);
  }).catch((err) => {
    console.error('[backfill] Error:', err);
    process.exit(1);
  });
}
