'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');

/**
 * Simple fetch all products
 */
async function getAllProducts() {
  try {
    logger.info('API - Fetch All Products');
    // Push status filter to DB (was loading all, filtering in JS)
    const allProducts = await Product.find({ status: true })
      .select(LIST_EXCLUDE_SELECT)
      .lean();

    logger.info('Return - API - Fetch All Products');
    return allProducts;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching data from API:');
    throw { status: 500, message: 'Internal Server Error' };
  }
}

module.exports = { getAllProducts };
