'use strict';

const Product = require('../../../repositories').products.rawModel();
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');

/**
 * Get products filtered by price range with pagination.
 * @param {Object} config
 * @param {number} config.startPrice
 * @param {number} config.endPrice
 * @param {number} config.page
 * @param {number} config.limit
 */
async function productsByPrice({ startPrice, endPrice, page, limit }) {
    if (isNaN(startPrice) || isNaN(endPrice)) {
        const err = new Error("Invalid price range parameters");
        err.status = 400;
        err.responseBody = { success: false, message: "Invalid price range parameters" };
        throw err;
    }

    const query = {
        totalQty: { $gt: 0 },
        $or: [
            { status: { $exists: false } },
            { status: true }
        ],
        discountedPrice: { $gte: startPrice, $lte: endPrice },
        "product.images.0": { $exists: true },
    };

    const products = await Product.find(query)
        .select(LIST_EXCLUDE_SELECT)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

    const totalCount = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    return {
        success: true,
        products,
        pagination: {
            currentPage: page,
            totalPages,
            totalProducts: totalCount,
            productsPerPage: limit,
            priceRange: `${startPrice} - ${endPrice}`
        }
    };
}

module.exports = { productsByPrice };
