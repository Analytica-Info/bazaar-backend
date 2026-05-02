'use strict';

/**
 * Phase 3 — personalization layer.
 *
 * Two strategies, used together:
 *   1. User vector: decayed average of viewed/purchased product embeddings.
 *      Used as the query in `getSimilar`-style lookups for "for_you".
 *   2. ALS scoring: optional, served by an external Python microservice
 *      (recsys-service/) over HTTP. If the service is unreachable, fall
 *      back to the user-vector path silently.
 *
 * The microservice contract is documented in recsys-service/README.md.
 *
 *   POST {RECSYS_URL}/score  body: { userId, candidateIds, k }
 *     -> { items: [{ productId, score }] }
 */

const repos = require('../../repositories');
const logger = require('../../utilities/logger');

const RECSYS_URL = process.env.RECSYS_URL || null;
const VIEW_DECAY_DAYS = Number(process.env.RECS_USER_DECAY_DAYS || 30);

function decayWeight(date) {
    const ageDays = (Date.now() - new Date(date).getTime()) / 86_400_000;
    return Math.exp(-ageDays / VIEW_DECAY_DAYS);
}

async function getUserVector(userId) {
    if (!userId) return null;
    const Order = repos.orders.rawModel();
    const OrderDetail = repos.orderDetails.rawModel();

    const recentOrders = await Order.find({
        $or: [{ userId }, { user_id: userId }],
    })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('_id createdAt')
        .lean();

    if (!recentOrders.length) return null;

    const details = await OrderDetail.find({
        order_id: { $in: recentOrders.map((o) => o._id) },
    })
        .select('product_id order_id')
        .lean();

    const orderDateById = new Map(recentOrders.map((o) => [String(o._id), o.createdAt]));
    const productIds = [...new Set(details.map((d) => String(d.product_id)))];

    const embeddings = await repos.productEmbeddings.model
        .find({ productId: { $in: productIds } })
        .select('productId embedding')
        .lean();
    if (!embeddings.length) return null;

    const dim = embeddings[0].embedding.length;
    const acc = new Array(dim).fill(0);
    let totalWeight = 0;

    const weightById = new Map();
    for (const d of details) {
        const w = decayWeight(orderDateById.get(String(d.order_id)) || new Date());
        weightById.set(String(d.product_id), (weightById.get(String(d.product_id)) || 0) + w);
    }

    for (const e of embeddings) {
        const w = weightById.get(String(e.productId)) || 0;
        if (w <= 0) continue;
        for (let i = 0; i < dim; i += 1) acc[i] += e.embedding[i] * w;
        totalWeight += w;
    }
    if (!totalWeight) return null;
    return acc.map((v) => v / totalWeight);
}

async function alsScore({ userId, candidateIds, k }) {
    if (!RECSYS_URL || !userId) return null;
    try {
        const res = await fetch(`${RECSYS_URL}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: String(userId), candidateIds, k }),
            signal: AbortSignal.timeout(800),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return Array.isArray(json.items) ? json.items : null;
    } catch (err) {
        logger.warn({ module: 'recs-als', err: err.message }, 'ALS service unreachable');
        return null;
    }
}

module.exports = { getUserVector, alsScore };
