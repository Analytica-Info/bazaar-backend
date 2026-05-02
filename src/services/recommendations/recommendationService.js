'use strict';

/**
 * Recommendation service (Phase 1 — heuristics).
 *
 * Strategies:
 *   - trending: 7d decayed view+sale score (computed by smartCategoriesService
 *     today; we delegate and shape into rec format).
 *   - similar:  category match + price band + popularity fallback.
 *   - frequently_bought: precomputed CoPurchasePair lookup, with category
 *     fallback when pair table is cold.
 *   - for_you:  user's recent categories blended with trending; falls back to
 *     trending for anonymous users.
 *
 * Phase 2 will replace `similar` with embedding kNN. Phase 3 will replace
 * `for_you` with personalized scoring + LLM rerank.
 */

const crypto = require('crypto');
const repos = require('../../repositories');
const cache = require('../../utilities/cache');
const logger = require('../../utilities/logger');
const { cosine } = require('./embeddingService');
const personalization = require('./personalizationService');

const TTL = {
    trending: 60 * 60,
    similar: 60 * 60,
    frequentlyBought: 60 * 60,
    forYou: 60 * 15,
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function clampLimit(limit) {
    const n = Number.parseInt(limit, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
}

function makeRecId() {
    return crypto.randomBytes(8).toString('hex');
}

function inStock(p) {
    if (!p) return false;
    const stock = p?.product?.stock ?? p?.stock;
    if (stock === undefined || stock === null) return true;
    return Number(stock) > 0;
}

async function hydrateProducts(productIds, { excludeId } = {}) {
    if (!productIds.length) return [];
    const Product = repos.products.rawModel();
    const docs = await Product.find({ _id: { $in: productIds } }).lean();
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    return productIds
        .map((id) => byId.get(String(id)))
        .filter((p) => p && inStock(p) && String(p._id) !== String(excludeId));
}

async function getTrending({ category, region, limit } = {}) {
    const k = cache.key
        ? cache.key('rec', 'trending', category || 'all', region || 'all', String(clampLimit(limit)))
        : `bazaar:rec:trending:${category || 'all'}:${region || 'all'}:${clampLimit(limit)}`;

    return cache.getOrSet(k, TTL.trending, async () => {
        const Product = repos.products.rawModel();
        const filter = {};
        if (category) filter['product.categories'] = category;
        const docs = await Product.find(filter)
            .sort({ 'product.sales': -1, createdAt: -1 })
            .limit(clampLimit(limit))
            .lean();
        return {
            recId: makeRecId(),
            source: 'trending',
            items: docs.filter(inStock),
        };
    });
}

async function getSimilar(productId, { limit } = {}) {
    if (!productId) throw new Error('productId required');
    const k = `bazaar:rec:similar:${productId}:${clampLimit(limit)}`;
    return cache.getOrSet(k, TTL.similar, async () => {
        const Product = repos.products.rawModel();
        const anchor = await Product.findById(productId).lean();
        if (!anchor) return { recId: makeRecId(), source: 'similar', items: [] };

        const lim = clampLimit(limit);
        const category = anchor?.product?.categories?.[0] || anchor?.category;

        // Phase 2 path: embedding kNN if available.
        const embedded = await tryEmbeddingSimilar(anchor, { limit: lim, category });
        if (embedded.length >= Math.min(lim, 4)) {
            return { recId: makeRecId(), source: 'similar', items: embedded };
        }

        // Phase 1 fallback: category + price band heuristic.
        const price = Number(anchor?.product?.price?.sale_price ?? anchor?.product?.price ?? 0);
        const filter = { _id: { $ne: anchor._id } };
        if (category) filter['product.categories'] = category;
        if (price > 0) {
            filter['product.price.sale_price'] = {
                $gte: price * 0.5,
                $lte: price * 2,
            };
        }
        const docs = await Product.find(filter).limit(lim * 2).lean();
        return {
            recId: makeRecId(),
            source: 'similar',
            items: docs.filter(inStock).slice(0, lim),
        };
    });
}

async function tryEmbeddingSimilar(anchor, { limit, category }) {
    const anchorEmbed = await repos.productEmbeddings.findByProductId(anchor._id);
    if (!anchorEmbed) return [];

    // Atlas Vector Search path
    const knn = await repos.productEmbeddings.vectorSearch(anchorEmbed.embedding, {
        limit: limit * 2,
        category,
        excludeIds: [anchor._id],
    });
    if (knn.length) {
        const products = await hydrateProducts(knn.map((d) => d.productId), {
            excludeId: anchor._id,
        });
        return products.slice(0, limit);
    }

    // In-memory cosine fallback over a small candidate set.
    const candidateFilter = category ? { category } : {};
    const candidates = await repos.productEmbeddings.model
        .find(candidateFilter)
        .limit(500)
        .lean();
    const ranked = candidates
        .filter((c) => String(c.productId) !== String(anchor._id))
        .map((c) => ({ id: c.productId, score: cosine(anchorEmbed.embedding, c.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit * 2);
    return hydrateProducts(ranked.map((r) => r.id), { excludeId: anchor._id });
}

async function getFrequentlyBought(productId, { limit } = {}) {
    if (!productId) throw new Error('productId required');
    const lim = clampLimit(limit);
    const k = `bazaar:rec:fbt:${productId}:${lim}`;
    return cache.getOrSet(k, TTL.frequentlyBought, async () => {
        const partners = await repos.coPurchasePairs.topPartners(productId, lim * 2);
        if (!partners.length) {
            const fallback = await getSimilar(productId, { limit: lim });
            return { ...fallback, source: 'frequently_bought' };
        }
        const items = await hydrateProducts(
            partners.map((p) => p.partnerId),
            { excludeId: productId }
        );
        return {
            recId: makeRecId(),
            source: 'frequently_bought',
            items: items.slice(0, lim),
        };
    });
}

async function getForYou(userId, { limit } = {}) {
    const lim = clampLimit(limit);
    if (!userId) {
        const trending = await getTrending({ limit: lim });
        return { ...trending, source: 'for_you' };
    }
    const k = `bazaar:rec:foryou:${userId}:${lim}`;
    return cache.getOrSet(k, TTL.forYou, async () => {
        // Phase 3 path: user vector kNN over embeddings.
        const userVec = await personalization.getUserVector(userId);
        if (userVec) {
            const knn = await repos.productEmbeddings.vectorSearch(userVec, {
                limit: lim * 2,
            });
            if (knn.length) {
                const items = await hydrateProducts(knn.map((d) => d.productId));
                if (items.length >= Math.min(lim, 4)) {
                    const trimmed = items.slice(0, lim);
                    const candidateIds = trimmed.map((p) => String(p._id));
                    const alsScores = await personalization.alsScore({
                        userId,
                        candidateIds,
                        k: lim,
                    });
                    if (alsScores && alsScores.length) {
                        const scoreById = new Map(
                            alsScores.map((s) => [String(s.productId), s.score])
                        );
                        trimmed.sort(
                            (a, b) =>
                                (scoreById.get(String(b._id)) || 0) -
                                (scoreById.get(String(a._id)) || 0)
                        );
                    }
                    return { recId: makeRecId(), source: 'for_you', items: trimmed };
                }
            }
        }

        // Phase 1 fallback: category history + trending blend.
        const OrderDetail = repos.orderDetails.rawModel();
        const Order = repos.orders.rawModel();
        const orders = await Order.find({
            $or: [{ userId }, { user_id: userId }],
        })
            .sort({ createdAt: -1 })
            .limit(20)
            .select('_id')
            .lean();
        const orderIds = orders.map((o) => o._id);
        const details = orderIds.length
            ? await OrderDetail.find({ order_id: { $in: orderIds } }).select('product_id').lean()
            : [];
        const seen = new Set(details.map((d) => String(d.product_id)));

        const Product = repos.products.rawModel();
        const purchased = await Product.find({ _id: { $in: [...seen] } })
            .select('product.categories')
            .lean();
        const categories = [
            ...new Set(
                purchased.flatMap((p) => p?.product?.categories || []).filter(Boolean)
            ),
        ].slice(0, 5);

        const filter = categories.length
            ? { 'product.categories': { $in: categories }, _id: { $nin: [...seen] } }
            : { _id: { $nin: [...seen] } };
        const docs = await Product.find(filter)
            .sort({ 'product.sales': -1 })
            .limit(lim * 2)
            .lean();
        const items = docs.filter(inStock).slice(0, lim);
        return { recId: makeRecId(), source: 'for_you', items };
    });
}

async function logEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return { inserted: 0 };
    try {
        return await repos.recommendationEvents.logBatch(events);
    } catch (err) {
        logger.warn({ module: 'recommendations', err }, 'Failed to log rec events');
        return { inserted: 0 };
    }
}

module.exports = {
    getTrending,
    getSimilar,
    getFrequentlyBought,
    getForYou,
    logEvents,
};
