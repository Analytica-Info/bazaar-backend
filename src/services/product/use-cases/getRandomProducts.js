'use strict';

const Product = require('../../../repositories').products.rawModel();
const axios = require('axios');
const logger = require('../../../utilities/logger');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');

const API_KEY = process.env.API_KEY;

/**
 * Random products
 */
async function getRandomProducts(excludeId) {
  try {
    const categoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/product_types/${excludeId}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      }
    );
    const categoryDetails = categoryResponse.data;
    let categories = null;
    let categoryId = null;
    if (categoryDetails.data) {
      const categoryPath = categoryDetails.data.category_path;
      categories = categoryPath.map((category) => ({
        id: category.id,
        name: category.name,
      }));
      categoryId = categoryDetails.data.id;
    }

    // Push status + product_type_id filter to DB (was loading all, filtering in JS)
    const subcategoryProducts = await Product.find({
      status: true,
      'product.product_type_id': excludeId,
    })
      .select(LIST_EXCLUDE_SELECT)
      .lean();

    const filteredProducts = subcategoryProducts.filter((product) => {
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
    const randomProducts = getRandomItems(filteredProducts, 10);
    return { randomProducts };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching product details:');
    throw { status: 500, message: 'Failed to fetch product details' };
  }
}

module.exports = { getRandomProducts };
