#!/usr/bin/env node
/**
 * One-shot seed: upserts canonical entries into the coupons_v2 collection.
 *
 * The v2 coupon engine (src/services/coupon/use-cases/validate.js) only
 * recognizes codes that exist in CouponV2 with `status: 'active'`. Without
 * this seed, every website /v2/coupons/validate call returns NOT_FOUND.
 *
 * Run once after deploy:
 *   node src/scripts/seedCouponsV2.js
 *
 * Idempotent — safe to re-run. Existing `uses_remaining` is preserved so
 * re-seeding does not reset usage counters.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

/**
 * Canonical v2 coupon definitions.
 *
 * NOTE on FIRST15:
 *   - Per-user single-use (max_uses_user: 1). Enforced by CouponRedemption count.
 *   - `FirstOrder` predicate also runs server-side: rejects if the user's phone
 *     has ANY prior order. This is the authoritative single-use guard once a
 *     real order exists; max_uses_user catches pre-redemption reservations.
 *   - 10% off subtotal, capped at 30 AED — matches legacy FIRST15_CAP_AED.
 *   - trigger: 'code' — user must type it, not auto-applied.
 *
 * NOTE on UAE10:
 *   - Universal first-purchase boost. Same predicate + reward shape as FIRST15
 *     but no AED cap. Commented out below — only seed when ops confirms it
 *     should be active (currently still served from the legacy hardcoded
 *     UAE10_PROMOTION_ID flow in checkCouponCode.js).
 */
const COUPONS = [
    {
        code: 'first15',
        name: 'First Order — 10% off (capped 30 AED)',
        title: 'FIRST15',
        description: 'Get 10% off your first order, up to 30 AED.',
        status: 'active',
        trigger: 'code',
        max_uses_user: 1,
        max_uses_total: null, // unlimited globally — gated per-user
        uses_remaining: null,
        rules: [
            { type: 'first_order' },
        ],
        reward: { type: 'percent', percent: 10, cap_aed: 30 },
        priority: 0,
        stackable: false,
        created_by: 'seedCouponsV2',
    },
];

async function main() {
    await connectDB();
    const CouponV2 = require('../models/CouponV2');

    for (const data of COUPONS) {
        const { code, ...rest } = data;
        const existing = await CouponV2.findOne({ code }).lean();
        if (existing) {
            // Preserve usage counters; update everything else.
            const { uses_remaining: _ignored, ...patch } = rest;
            await CouponV2.updateOne({ code }, { $set: patch });
            console.log(`Updated CouponV2: ${code} (preserved uses_remaining)`);
        } else {
            await CouponV2.create({ code, ...rest });
            console.log(`Inserted CouponV2: ${code}`);
        }
    }

    console.log('\nSeed complete.');
    await mongoose.connection.close();
}

main().catch((err) => {
    console.error('seedCouponsV2 failed:', err);
    process.exit(1);
});
