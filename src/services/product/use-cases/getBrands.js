'use strict';

const Brand = require('../../../repositories').brands.rawModel();
const axios = require('axios');
const logger = require('../../../utilities/logger');

const API_KEY = process.env.API_KEY;
const BRANDS_URL = process.env.BRANDS_URL;

async function fetchBrands() {
  try {
    const brandsResponse = await axios.get(BRANDS_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    });
    return brandsResponse.data || [];
  } catch (error) {
    logger.warn({ err: error.message }, 'Error fetching brands from Lightspeed');
    return [];
  }
}

/**
 * Sync + return brands
 */
async function getBrands() {
  try {
    const brandsData = await fetchBrands();
    if (!brandsData.data || !Array.isArray(brandsData.data)) {
      throw { status: 500, message: 'brandsData.data is not an array' };
    }
    const simplifiedBrands = brandsData.data.map((brand) => ({
      id: brand.id,
      name: brand.name,
    }));

    const bulkOps = simplifiedBrands.map((brand) => ({
      updateOne: {
        filter: { id: brand.id },
        update: { $set: { name: brand.name } },
        upsert: true,
      },
    }));
    await Brand.bulkWrite(bulkOps);

    logger.info('Return - API - All Brands');
    return {
      success: true,
      message: 'Brands processed and saved to the database successfully.',
    };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Brands API error:');
    throw { status: 500, message: 'Failed to fetch or save brands' };
  }
}

module.exports = { getBrands };
