'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');
const { logStatusFalseItems } = require('../domain/statusLogger');

/**
 * Similar products
 */
async function getSimilarProducts(productTypeId, productId) {
  try {
    if (!productTypeId || productTypeId.trim() === '') {
      throw {
        status: 400,
        message: 'Product type ID is required',
      };
    }

    const escapedId = productTypeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const products = await Product.find({
      $or: [{ status: { $exists: false } }, { status: true }],
      'product.product_type_id': {
        $regex: escapedId,
        $options: 'i',
      },
      variantsData: { $exists: true, $ne: [] },
      discountedPrice: { $exists: true, $gt: 0 },
    })
      .select(LIST_EXCLUDE_SELECT)
      .lean();

    const filteredProducts = products.filter((product) => {
      if (productId && product._id.toString() === productId.toString()) {
        return false;
      }

      return (
        product.variantsData &&
        product.variantsData.length > 0 &&
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
      );
    });

    const getRandomItems = (array, count) => {
      const shuffled = array.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    };

    const similarProducts = getRandomItems(filteredProducts, 20);

    const responseData = { similarProducts };

    logStatusFalseItems('/api/products/similarProducts', {}, responseData);

    return responseData;
  } catch (error) {
    if (error.status) throw error;
    console.error('Error fetching similar products:', error.message);
    throw {
      status: 500,
      message: 'Failed to fetch similar products',
    };
  }
}

module.exports = { getSimilarProducts };
