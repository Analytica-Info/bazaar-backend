'use strict';

const Product = require('../../../repositories').products.rawModel();
const OrderDetail = require('../../../repositories').orderDetails.rawModel();
const cache = require('../../../utilities/cache');
const clock = require('../../../utilities/clock');
const { LIST_EXCLUDE_PROJECTION, LIST_EXCLUDE_SELECT } = require('../domain/projections');

const SMART_CAT_TTL = 300;

/**
 * Get favourites of the week based on sales in last 7 days.
 */
async function favouritesOfWeek() {
    return cache.getOrSet(cache.key('catalog', 'favourites-of-week', 'v1'), SMART_CAT_TTL, async () => {
        const nowDubaiUTC = clock.now();
        const sevenDaysAgoUTC = new Date(nowDubaiUTC.getTime() - 7 * 24 * 60 * 60 * 1000);

        const soldProducts = await OrderDetail.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgoUTC } } },
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

        let products = await Product.find({
            'product.id': { $in: soldProductIds },
            totalQty: { $gt: 0 }
        })
            .select(LIST_EXCLUDE_SELECT)
            .lean();

        products = products.filter(product =>
            product.product?.images &&
            Array.isArray(product.product.images) &&
            product.product.images.length > 0
        );

        const soldMap = Object.fromEntries(soldProducts.map(s => [s._id.toString(), s.totalSold]));
        products.sort((a, b) => {
            const soldA = soldMap[a._id.toString()] || 0;
            const soldB = soldMap[b._id.toString()] || 0;
            if (soldB !== soldA) return soldB - soldA;
            return b.discount - a.discount;
        });

        const favourites = products.slice(0, 20);

        const randomProducts = await Product.aggregate([
            { $match: { status: true, totalQty: { $gt: 0 } } },
            {
                $match: {
                    $expr: { $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0] }
                }
            },
            { $sample: { size: 10 } },
            { $project: LIST_EXCLUDE_PROJECTION }
        ]);

        const finalData = [...new Map([...randomProducts, ...favourites].map(item => [item._id.toString(), item])).values()]
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);

        return {
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        };
    });
}

module.exports = { favouritesOfWeek };
