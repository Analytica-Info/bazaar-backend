'use strict';

const Product = require('../../../repositories').products.rawModel();
const Review = require('../../../repositories').reviews.rawModel();
const cache = require('../../../utilities/cache');
const { LIST_EXCLUDE_PROJECTION } = require('../domain/projections');

const SMART_CAT_TTL = 300;

/**
 * Get top rated products based on reviews.
 */
async function getTopRatedProducts() {
    return cache.getOrSet(cache.key('catalog', 'top-rated', 'v1'), SMART_CAT_TTL, async () => {
        const topProducts = await Review.aggregate([
            {
                $addFields: {
                    avgRating: {
                        $avg: ["$quality_rating", "$value_rating", "$price_rating"]
                    }
                }
            },
            {
                $group: {
                    _id: "$product_id",
                    avgRating: { $avg: "$avgRating" },
                    totalReviews: { $sum: 1 }
                }
            },
            { $sort: { avgRating: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "product.id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $addFields: {
                    "product.avgRating": "$avgRating",
                    "product.totalReviews": "$totalReviews"
                }
            },
            { $replaceRoot: { newRoot: "$product" } },
            { $project: LIST_EXCLUDE_PROJECTION }
        ]);

        const products = await Product.aggregate([
            {
                $match: {
                    status: true,
                    totalQty: { $gt: 0 }
                }
            },
            {
                $match: {
                    $expr: {
                        $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                    }
                }
            },
            { $sample: { size: 10 } },
            { $project: LIST_EXCLUDE_PROJECTION }
        ]);

        const filteredTopProducts = topProducts.filter(product =>
            product.product?.images &&
            Array.isArray(product.product.images) &&
            product.product.images.length > 0
        );

        const finalData = [...new Map([...filteredTopProducts, ...products].map(item => [item._id.toString(), item])).values()]
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);

        return {
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        };
    });
}

module.exports = { getTopRatedProducts };
