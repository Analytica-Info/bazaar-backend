'use strict';

const repositories = require('../../../repositories');
const cache = require('../../../utilities/cache');
const clock = require('../../../utilities/clock');
const { LIST_EXCLUDE_PROJECTION, LIST_EXCLUDE_SELECT } = require('../domain/projections');
const runtimeConfig = require('../../../config/runtime');
const { MS_PER_HOUR } = require('../../../config/constants/time');

/**
 * Core order-derived rail builder.
 *
 * Algorithm (shared by todayDeal, getTrendingProducts, favouritesOfWeek):
 *   1. Aggregate OrderDetail within [windowHours] to find sold product IDs.
 *   2. Product.find by those IDs (with optional productMatch filter).
 *   3. Filter to products that have images.
 *   4. Sort by [primarySort, secondarySort].
 *   5. Optionally pre-slice (preSliceCount) before merging with $sample fallback.
 *   6. $sample fallback: fetch random in-stock products with images.
 *   7. JS dedup by _id → random shuffle → slice(0, sliceCount).
 *   8. Return { status, count, products }.
 *
 * @param {object}  opts
 * @param {string}  opts.cacheKey         Full cache key (caller controls versioning).
 * @param {number}  [opts.ttlSeconds]     Redis TTL; falls back to runtimeConfig.cache.smartCategoryTtl.
 * @param {number}  opts.windowHours      OrderDetail time window in hours.
 * @param {number}  [opts.sliceCount=10]  Final result length.
 * @param {'discount-desc'|'sold-desc'} [opts.primarySort='sold-desc']
 *   Primary sort applied to the order-derived product list.
 * @param {'discount-desc'|'sold-desc'|null} [opts.secondarySort=null]
 *   Tie-breaking sort applied after the primary.
 * @param {object}  [opts.productMatch={}]
 *   Extra Mongo $match clauses merged with the base `{ 'product.id': { $in: ... } }` filter.
 * @param {number}  [opts.preSliceCount]
 *   If set, the order-derived list is sliced to this length before being merged
 *   with the random fallback (e.g. favouritesOfWeek pre-slices to 20).
 * @param {boolean} [opts.requireSoldProducts=false]
 *   If true, return early with { status:false, count:0, products:[] }
 *   when no sold products are found (getTrendingProducts behaviour).
 *
 * @returns {Promise<{ status: boolean, count: number, products: object[] }>}
 */
async function buildOrderDerivedRail({
    cacheKey,
    ttlSeconds,
    windowHours,
    sliceCount = 10,
    primarySort = 'sold-desc',
    secondarySort = null,
    productMatch = {},
    preSliceCount,
    requireSoldProducts = false,
}) {
    const ttl = ttlSeconds != null ? ttlSeconds : runtimeConfig.cache.smartCategoryTtl;
    const Product = repositories.products.rawModel();
    const OrderDetail = repositories.orderDetails.rawModel();

    return cache.getOrSet(cacheKey, ttl, async () => {
        // ── 1. Aggregate sold products within the time window ──────────────────
        const nowDubaiUTC = clock.now();
        const cutoff = new Date(nowDubaiUTC.getTime() - windowHours * MS_PER_HOUR);

        const soldProducts = await OrderDetail.aggregate([
            { $match: { createdAt: { $gte: cutoff } } },
            {
                $group: {
                    _id: '$product_id',
                    totalSold: { $sum: '$quantity' },
                },
            },
            { $match: { totalSold: { $gte: 1 } } },
        ]);

        const soldProductIds = soldProducts.map(p => p._id);

        // ── 2. Early-exit guard (getTrendingProducts behaviour) ────────────────
        if (requireSoldProducts && !soldProductIds.length) {
            return { status: false, count: 0, products: [] };
        }

        // ── 3. Fetch + filter order-derived products ───────────────────────────
        let orderDerivedProducts = [];
        if (soldProductIds.length) {
            const baseFilter = { 'product.id': { $in: soldProductIds } };
            const combinedFilter = Object.assign({}, baseFilter, productMatch);

            orderDerivedProducts = await Product.find(combinedFilter)
                .select(LIST_EXCLUDE_SELECT)
                .lean();

            // Keep only products that have at least one image
            orderDerivedProducts = orderDerivedProducts.filter(product =>
                product.product?.images &&
                Array.isArray(product.product.images) &&
                product.product.images.length > 0
            );

            // ── 4. Sort by [primarySort, secondarySort] ────────────────────────
            const soldMap = Object.fromEntries(
                soldProducts.map(s => [s._id.toString(), s.totalSold])
            );

            orderDerivedProducts.sort((a, b) => {
                const soldA = soldMap[a._id.toString()] || 0;
                const soldB = soldMap[b._id.toString()] || 0;

                const primaryDiff = _compare(a, b, soldA, soldB, primarySort);
                if (primaryDiff !== 0) return primaryDiff;

                if (secondarySort) {
                    return _compare(a, b, soldA, soldB, secondarySort);
                }
                return 0;
            });

            // ── 5. Optional pre-slice (favouritesOfWeek slices to 20 first) ───
            if (preSliceCount != null) {
                orderDerivedProducts = orderDerivedProducts.slice(0, preSliceCount);
            }
        }

        // ── 6. $sample fallback — random in-stock products with images ─────────
        const randomProducts = await Product.aggregate([
            { $match: { status: true, totalQty: { $gt: 0 } } },
            {
                $match: {
                    $expr: { $gt: [{ $size: { $ifNull: ['$product.images', []] } }, 0] },
                },
            },
            { $sample: { size: sliceCount } },
            { $project: LIST_EXCLUDE_PROJECTION },
        ]);

        // ── 7. Dedup → random shuffle → slice ─────────────────────────────────
        // favouritesOfWeek merges [random, ...orderDerived] so orderDerived wins;
        // the others merge [orderDerived, ...random] so orderDerived wins equally.
        // We always put orderDerived last so it overwrites duplicates in the Map.
        const finalData = [
            ...new Map(
                [...randomProducts, ...orderDerivedProducts].map(item => [item._id.toString(), item])
            ).values(),
        ]
            .sort(() => Math.random() - 0.5)
            .slice(0, sliceCount);

        return {
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData,
        };
    });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compare two products according to a named sort direction.
 * Returns negative if a < b (should come first for desc), positive if a > b.
 */
function _compare(a, b, soldA, soldB, sortKey) {
    if (sortKey === 'discount-desc') {
        return (b.discount || 0) - (a.discount || 0);
    }
    if (sortKey === 'sold-desc') {
        return soldB - soldA;
    }
    return 0;
}

module.exports = { buildOrderDerivedRail };
