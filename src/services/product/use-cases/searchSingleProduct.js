'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { escapeRegex } = require('../../../utilities/stringUtils');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');

/**
 * Single product search
 */
async function searchSingleProduct(name) {
  try {
    const productName = escapeRegex(name.toLowerCase());
    const products = await Product.find({
      'product.name': { $regex: productName, $options: 'i' },
    })
      .select(LIST_EXCLUDE_SELECT)
      .lean();
    if (products.length === 0) {
      throw {
        status: 404,
        message: `Product not found with the name "${name}"`,
      };
    }
    let filteredProducts = products.map((product) => product);
    filteredProducts = filteredProducts.filter(
      (product) => product.status === true
    );
    return { filteredProducts };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Error searching for product:');
    throw { status: 500, message: 'Internal Server Error' };
  }
}

module.exports = { searchSingleProduct };
