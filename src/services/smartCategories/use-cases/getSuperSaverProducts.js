'use strict';

const Product = require('../../../repositories').products.rawModel();
const cache = require('../../../utilities/cache');
const { LIST_EXCLUDE_PROJECTION } = require('../domain/projections');

const runtimeConfig = require('../../../config/runtime');
const SMART_CAT_TTL = runtimeConfig.cache.smartCategoryTtl;

/**
 * Get super saver products with high discounts.
 * @param {Object} config
 * @param {number} config.minItems - 20 for ecommerce, 8 for mobile
 */
async function getSuperSaverProducts({ minItems }) {
    return cache.getOrSet(
        cache.key('catalog', 'super-saver', `n${minItems}`, 'v1'),
        SMART_CAT_TTL,
        async () => {
            const ranges = { min: 1, max: 99 };
            const requiredCount = minItems;

            const highestDiscountProduct = await Product.findOne({ isHighest: true })
                .select("discount")
                .lean();

            const superSaverProducts = await Product.aggregate([
                {
                    $match: {
                        discount: { $gte: ranges.min, $lte: ranges.max },
                        $expr: { $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0] }
                    }
                },
                { $sample: { size: requiredCount } },
                { $project: LIST_EXCLUDE_PROJECTION }
            ]);

            return {
                status: superSaverProducts.length > 0,
                count: superSaverProducts.length,
                highestDiscount: highestDiscountProduct.discount,
                products: superSaverProducts
            };
        }
    );
}

module.exports = { getSuperSaverProducts };
