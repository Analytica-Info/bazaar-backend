'use strict';

const Product = require('../../../repositories').products.rawModel();
const ProductView = require('../../../repositories').productViews.rawModel();
const Review = require('../../../repositories').reviews.rawModel();
const logger = require('../../../utilities/logger');
const { logStatusFalseItems } = require('../domain/statusLogger');
const { trackProductView } = require('./trackProductView');

/**
 * Product details + track view
 */
async function getProductDetails(productId, userId) {
  try {
    const product = await Product.findOne({ 'product.id': productId });
    if (!product) {
      throw { status: 404, message: 'No product found.' };
    }

    await trackProductView(product._id, userId || null);

    // .lean() — reviews are read-only, no Mongoose overhead needed
    const reviews = await Review.find({ product_id: product._id }).lean();

    let totalQuality = 0;
    let totalValue = 0;
    let totalPrice = 0;
    const count = reviews.length;

    for (const review of reviews) {
      totalQuality += review.quality_rating || 0;
      totalValue += review.value_rating || 0;
      totalPrice += review.price_rating || 0;
    }

    const avgQuality = count ? (totalQuality / count).toFixed(1) : 0;
    const avgValue = count ? (totalValue / count).toFixed(1) : 0;
    const avgPrice = count ? (totalPrice / count).toFixed(1) : 0;

    const result = await ProductView.aggregate([
      { $match: { product_id: product._id } },
      { $group: { _id: null, totalViews: { $sum: '$views' } } },
    ]);

    const totalViews = result[0]?.totalViews || 0;

    const responseData = {
      _id: product._id,
      id: product._id,
      product: product.product,
      variantsData: product.variantsData,
      totalQty: product.totalQty,
      originalPrice: product.originalPrice || 0,
      discountedPrice: product.discountedPrice || 0,
      discount: product.discount || 0,
      reviews: reviews,
      reviewsCount: reviews.length,
      avgQuality: avgQuality,
      avgValue: avgValue,
      avgPrice: avgPrice,
      total_view: totalViews,
    };

    logStatusFalseItems('/api/products/productsDetails', {}, responseData);

    return responseData;
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw {
      status: 500,
      message: 'An error occurred while fetching product.',
    };
  }
}

module.exports = { getProductDetails };
