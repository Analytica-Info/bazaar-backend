#!/usr/bin/env node
/**
 * One-shot backfill: ensure every Order document has both `userId` and
 * `user_id` populated with the same value.
 *
 * Historically the mobile backend wrote only `user_id` and the web backend
 * wrote only `userId`. The pre-save hook in src/models/Order.js fixes this
 * for new writes; this script reconciles existing rows.
 *
 * Usage:
 *   node src/scripts/backfillOrderOwnerFields.js          # dry run, prints counts
 *   node src/scripts/backfillOrderOwnerFields.js --apply  # actually write
 *
 * Idempotent. Safe to re-run.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const APPLY = process.argv.includes('--apply');

async function main() {
    await connectDB();
    const Order = mongoose.connection.collection('orders');

    const total = await Order.countDocuments({});

    const onlyUserId = await Order.countDocuments({
        userId: { $exists: true, $ne: null },
        $or: [{ user_id: { $exists: false } }, { user_id: null }],
    });
    const onlyUser_id = await Order.countDocuments({
        user_id: { $exists: true, $ne: null },
        $or: [{ userId: { $exists: false } }, { userId: null }],
    });
    const neither = await Order.countDocuments({
        $and: [
            { $or: [{ userId: { $exists: false } }, { userId: null }] },
            { $or: [{ user_id: { $exists: false } }, { user_id: null }] },
        ],
    });

    // Rows where BOTH are set — are the values equal?
    const bothSetButDiverge = await Order.aggregate([
        {
            $match: {
                userId: { $exists: true, $ne: null },
                user_id: { $exists: true, $ne: null },
            },
        },
        {
            $project: {
                equal: {
                    $eq: [
                        { $toString: '$userId' },
                        { $toString: '$user_id' },
                    ],
                },
            },
        },
        { $match: { equal: false } },
        { $count: 'n' },
    ]).toArray();
    const divergentCount = bothSetButDiverge[0]?.n || 0;

    const bothSet = total - onlyUserId - onlyUser_id - neither;
    const bothSetEqual = bothSet - divergentCount;

    console.log(`\nOrder ownership-field state (total: ${total} rows)`);
    console.log(`-----------------------------------------------------`);
    console.log(`  both fields set & equal       : ${bothSetEqual}`);
    console.log(`  both fields set & DIVERGENT   : ${divergentCount}   ${divergentCount > 0 ? '⚠️  needs investigation' : ''}`);
    console.log(`  only userId set (needs mirror): ${onlyUserId}`);
    console.log(`  only user_id set (needs mirror): ${onlyUser_id}`);
    console.log(`  neither set                   : ${neither}`);

    if (divergentCount > 0) {
        console.log(`\n⚠️  ${divergentCount} row(s) have userId !== user_id.`);
        console.log('    Sample (up to 10):');
        const samples = await Order.find({
            userId: { $exists: true, $ne: null },
            user_id: { $exists: true, $ne: null },
            $expr: { $ne: [{ $toString: '$userId' }, { $toString: '$user_id' }] },
        }).project({ _id: 1, order_id: 1, userId: 1, user_id: 1, createdAt: 1 }).limit(10).toArray();
        samples.forEach((d) => console.log(`      _id=${d._id}  order_id=${d.order_id}  userId=${d.userId}  user_id=${d.user_id}  createdAt=${d.createdAt}`));
        console.log('\n    The backfill script does NOT auto-resolve these. Investigate manually.');
    }

    if (!APPLY) {
        console.log('\n(dry run — re-run with --apply to mirror missing fields)');
        await mongoose.connection.close();
        return;
    }

    const r1 = await Order.updateMany(
        {
            userId: { $exists: true, $ne: null },
            $or: [{ user_id: { $exists: false } }, { user_id: null }],
        },
        [{ $set: { user_id: '$userId' } }]
    );
    const r2 = await Order.updateMany(
        {
            user_id: { $exists: true, $ne: null },
            $or: [{ userId: { $exists: false } }, { userId: null }],
        },
        [{ $set: { userId: '$user_id' } }]
    );

    console.log(`\nApplied: copied userId → user_id on ${r1.modifiedCount} row(s)`);
    console.log(`Applied: copied user_id → userId on ${r2.modifiedCount} row(s)`);

    await mongoose.connection.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
