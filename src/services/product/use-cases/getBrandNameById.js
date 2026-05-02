'use strict';

const Brand = require('../../../repositories').brands.rawModel();
const logger = require('../../../utilities/logger');

/**
 * Brand name lookup
 */
async function getBrandNameById(id) {
  try {
    const brand = await Brand.findOne({ id: id }).select('id name');
    if (!brand) {
      throw { status: 404, message: 'Brand not found' };
    }
    return {
      brand: {
        id: brand.id,
        name: brand.name,
      },
    };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Error fetching brand name:');
    throw { status: 500, message: 'Server error' };
  }
}

module.exports = { getBrandNameById };
