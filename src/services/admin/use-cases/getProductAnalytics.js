'use strict';

const mongoose     = require('mongoose');
const ProductView  = require('../../../repositories').productViews.rawModel();
const Product      = require('../../../repositories').products.rawModel();

module.exports = async function getProductAnalytics({ page, limit, search, startDate, endDate }) {
    page  = parseInt(page)  || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;

    const productViews = await ProductView.aggregate([
        { $group: { _id: '$product_id', totalViews: { $sum: '$views' }, uniqueUsers: { $addToSet: '$user_id' } } },
        { $project: { product_id: '$_id', totalViews: 1, uniqueUsers: { $size: '$uniqueUsers' }, _id: 0 } },
        { $sort: { totalViews: -1 } },
        { $skip: skip },
        { $limit: limit }
    ]);

    const totalProducts = await ProductView.distinct('product_id');
    const totalCount    = totalProducts.length;
    const totalPages    = Math.ceil(totalCount / limit);

    const productIds = productViews.map(pv => new mongoose.Types.ObjectId(pv.product_id));
    const products   = await Product.find({ _id: { $in: productIds } })
        .select('product.name product.images discountedPrice originalPrice')
        .lean();

    const productsMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    const analyticsData = productViews.map(pv => {
        const product = productsMap[pv.product_id.toString()];
        let productImage = null;
        const images = product?.product?.images;
        if (Array.isArray(images) && images.length > 0) {
            const first = images[0];
            productImage = typeof first === 'string' ? first : (first?.sizes?.original || first?.original || null);
        }
        return {
            product_id:    pv.product_id,
            product_name:  product?.product?.name || 'Unknown Product',
            product_price: product?.discountedPrice || product?.originalPrice || 0,
            product_image: productImage,
            total_views:   pv.totalViews,
            unique_users:  pv.uniqueUsers
        };
    });

    return {
        analytics: analyticsData,
        pagination: { currentPage: page, totalPages, totalProducts: totalCount, limit }
    };
};
