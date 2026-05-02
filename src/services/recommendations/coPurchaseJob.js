'use strict';

/**
 * Nightly co-purchase aggregation job.
 *
 * Reads OrderDetail rows from the last LOOKBACK_DAYS, groups by order_id,
 * emits all unordered product-id pairs with co-occurrence count, computes a
 * lift-style score, and replaces the CoPurchasePair collection.
 *
 * Score = coCount / sqrt(countA * countB)
 *   This is cosine over presence vectors — bounded [0,1], penalises ubiquitous
 *   products that pair with everything. Good Phase 1 default; revisit when
 *   moving to learned scoring in Phase 3.
 *
 * Run via cron or `node scripts/runCoPurchaseJob.js`. Safe to re-run.
 */

const repos = require('../../repositories');
const logger = require('../../utilities/logger');

const LOOKBACK_DAYS = Number(process.env.RECS_COPURCHASE_LOOKBACK_DAYS || 90);
const MIN_CO_COUNT = Number(process.env.RECS_COPURCHASE_MIN_CO_COUNT || 2);
const MAX_PAIRS = Number(process.env.RECS_COPURCHASE_MAX_PAIRS || 200_000);

async function run() {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const OrderDetail = repos.orderDetails.rawModel();

    logger.info({ module: 'recs', job: 'coPurchase', since }, 'Starting co-purchase aggregation');

    const grouped = await OrderDetail.aggregate([
        { $match: { createdAt: { $gte: since }, product_id: { $ne: null } } },
        { $group: { _id: '$order_id', products: { $addToSet: '$product_id' } } },
        { $match: { 'products.1': { $exists: true } } },
    ]).allowDiskUse(true);

    const pairCount = new Map();
    const productCount = new Map();

    for (const row of grouped) {
        const products = [...new Set(row.products.map(String))].sort();
        for (const p of products) {
            productCount.set(p, (productCount.get(p) || 0) + 1);
        }
        for (let i = 0; i < products.length; i += 1) {
            for (let j = i + 1; j < products.length; j += 1) {
                const key = `${products[i]}|${products[j]}`;
                pairCount.set(key, (pairCount.get(key) || 0) + 1);
            }
        }
    }

    const pairs = [];
    for (const [key, coCount] of pairCount) {
        if (coCount < MIN_CO_COUNT) continue;
        const [a, b] = key.split('|');
        const ca = productCount.get(a) || 1;
        const cb = productCount.get(b) || 1;
        const score = coCount / Math.sqrt(ca * cb);
        pairs.push({ a, b, coCount, score, computedAt: new Date() });
    }

    pairs.sort((x, y) => y.score - x.score);
    const truncated = pairs.slice(0, MAX_PAIRS);

    const CoPurchasePair = repos.coPurchasePairs.model;
    await CoPurchasePair.deleteMany({});
    const result = await repos.coPurchasePairs.bulkReplace(truncated);

    logger.info(
        {
            module: 'recs',
            job: 'coPurchase',
            ordersProcessed: grouped.length,
            uniqueProducts: productCount.size,
            pairsKept: truncated.length,
            ...result,
        },
        'Co-purchase aggregation complete'
    );
    return { pairsKept: truncated.length };
}

module.exports = { run };
