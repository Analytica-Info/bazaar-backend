'use strict';

const Product = require('../../../repositories').products.rawModel();
const OrderDetail = require('../../../repositories').orderDetails.rawModel();
const cache = require('../../../utilities/cache');
const clock = require('../../../utilities/clock');
const { LIST_EXCLUDE_PROJECTION, LIST_EXCLUDE_SELECT } = require('../domain/projections');

const SMART_CAT_TTL = 300;

/**
 * Get trending products based on recent sales.
 * @param {Object} config
 * @param {number} config.timeWindowHours - 72 for ecommerce, 100 for mobile
 */
async function getTrendingProducts({ timeWindowHours }) {
    return cache.getOrSet(
        cache.key('catalog', 'trending', `w${timeWindowHours}`, 'v1'),
        SMART_CAT_TTL,
        async () => {
            const nowDubaiUTC = clock.now();
            const cutoff = new Date(nowDubaiUTC.getTime() - timeWindowHours * 60 * 60 * 1000);

            const soldProducts = await OrderDetail.aggregate([
                { $match: { createdAt: { $gte: cutoff } } },
                {
                    $group: {
                        _id: "$product_id",
                        totalSold: { $sum: "$quantity" },
                    },
                },
                { $match: { totalSold: { $gte: 1 } } },
            ]);

            const soldProductIds = soldProducts.map(p => p._id);
            if (!soldProductIds.length) {
                return { status: false, count: 0, products: [] };
            }

            const trendingProducts = await Product.find(
                { 'product.id': { $in: soldProductIds } }
            )
                .select(LIST_EXCLUDE_SELECT)
                .lean();

            const filteredTrendingProducts = trendingProducts.filter(product =>
                product.product?.images &&
                Array.isArray(product.product.images) &&
                product.product.images.length > 0
            );

            const products = await Product.aggregate([
                { $match: { status: true, totalQty: { $gt: 0 } } },
                {
                    $match: {
                        $expr: { $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0] }
                    }
                },
                { $sample: { size: 10 } },
                { $project: LIST_EXCLUDE_PROJECTION }
            ]);

            const finalData = [...new Map([...filteredTrendingProducts, ...products].map(item => [item._id.toString(), item])).values()]
                .sort(() => Math.random() - 0.5)
                .slice(0, 10);

            return {
                status: finalData.length > 0,
                count: finalData.length,
                products: finalData
            };
        }
    );
}

module.exports = { getTrendingProducts };
