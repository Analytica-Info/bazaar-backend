'use strict';

const mongoose    = require('mongoose');
const ProductView = require('../../../repositories').productViews.rawModel();
const Product     = require('../../../repositories').products.rawModel();

module.exports = async function getProductViewDetails(productId) {
    const productViews = await ProductView.find({ product_id: new mongoose.Types.ObjectId(productId) })
        .populate('user_id', 'name email')
        .sort({ lastViewedAt: -1 });

    const product = await Product.findById(productId)
        .select('product.name discountedPrice originalPrice')
        .lean();

    const viewDetails = productViews.map(pv => ({
        user_id:      pv.user_id?._id   || null,
        user_name:    pv.user_id?.name  || 'Guest',
        user_email:   pv.user_id?.email || null,
        views:        pv.views,
        last_viewed:  pv.lastViewedAt
    }));

    return {
        product: {
            _id:   product?._id,
            name:  product?.product?.name || 'Unknown Product',
            price: product?.discountedPrice || product?.originalPrice || 0
        },
        viewDetails,
        totalViews:   productViews.reduce((sum, pv) => sum + pv.views, 0),
        uniqueUsers:  productViews.length
    };
};
