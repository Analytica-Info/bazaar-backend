'use strict';

const mongoose    = require('mongoose');
const ProductView = require('../../../repositories').productViews.rawModel();
const Product     = require('../../../repositories').products.rawModel();

module.exports = async function exportProductAnalytics(filters) {
    const productViews = await ProductView.aggregate([
        { $group: { _id: '$product_id', totalViews: { $sum: '$views' }, uniqueUsers: { $addToSet: '$user_id' } } },
        { $project: { product_id: '$_id', totalViews: 1, uniqueUsers: { $size: '$uniqueUsers' }, _id: 0 } },
        { $sort: { totalViews: -1 } }
    ]);

    const productIds = productViews.map(pv => new mongoose.Types.ObjectId(pv.product_id));
    const products   = await Product.find({ _id: { $in: productIds } })
        .select('product.name discountedPrice originalPrice')
        .lean();

    const productsMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    return productViews.map(pv => {
        const product = productsMap[pv.product_id.toString()];
        return {
            product_name:  product?.product?.name || 'Unknown Product',
            product_price: product?.discountedPrice || product?.originalPrice || 0,
            total_views:   pv.totalViews,
            unique_users:  pv.uniqueUsers
        };
    });
};
