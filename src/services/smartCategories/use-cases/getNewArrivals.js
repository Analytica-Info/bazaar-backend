'use strict';

const Product = require('../../../repositories').products.rawModel();
const cache = require('../../../utilities/cache');
const { LIST_EXCLUDE_PROJECTION } = require('../domain/projections');

const SMART_CAT_TTL = 300;

/**
 * Get new arrival products with pagination.
 * @param {Object} config
 * @param {number} config.page
 * @param {number} config.limit
 * @param {number} config.maxItemsFromDb
 * @param {number|null} config.firstPageLimit - if set, first page uses different limit (ecommerce mode)
 */
async function getNewArrivals({ page, limit, maxItemsFromDb, firstPageLimit }) {
    return cache.getOrSet(
        cache.key('catalog', 'new-arrivals', `p${page}`, `l${limit}`, `fpl${firstPageLimit || 0}`, 'v1'),
        SMART_CAT_TTL,
        async () => {
            let skip, effectiveLimit;

            if (firstPageLimit) {
                const NEXT_PAGES_LIMIT = firstPageLimit;
                skip = page === 1 ? 0 : firstPageLimit + (page - 2) * NEXT_PAGES_LIMIT;
                effectiveLimit = page === 1 ? firstPageLimit : NEXT_PAGES_LIMIT;
            } else {
                skip = (page - 1) * limit;
                effectiveLimit = limit;
            }

            const result = await Product.aggregate([
                {
                    $match: {
                        status: true,
                        totalQty: { $gt: 0 },
                        createdAt: { $exists: true }
                    }
                },
                {
                    $match: {
                        $expr: { $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0] }
                    }
                },
                { $sort: { createdAt: -1 } },
                { $limit: maxItemsFromDb },
                {
                    $facet: {
                        totalCount: [{ $count: "count" }],
                        products: [
                            { $skip: skip },
                            { $limit: effectiveLimit },
                            { $project: LIST_EXCLUDE_PROJECTION }
                        ]
                    }
                }
            ]);

            const totalCount = result[0].totalCount[0]?.count ?? 0;
            const products = result[0].products ?? [];

            let totalPages;
            if (firstPageLimit) {
                totalPages = totalCount <= firstPageLimit
                    ? 1
                    : 1 + Math.ceil((totalCount - firstPageLimit) / firstPageLimit);
            } else {
                totalPages = Math.ceil(totalCount / limit);
            }

            const response = {
                status: products.length > 0,
                count: products.length,
                products,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalProducts: totalCount,
                    productsPerPage: effectiveLimit,
                }
            };

            if (firstPageLimit) {
                response.success = true;
            }

            return response;
        }
    );
}

module.exports = { getNewArrivals };
