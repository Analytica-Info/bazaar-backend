'use strict';

/**
 * Product-specific cache helpers.
 *
 * Wraps the shared Redis-backed cache utility (utilities/cache) with
 * product-domain key conventions. Graceful-degradation: falls back to
 * direct Lightspeed/DB call on Redis outage.
 */

const axios = require('axios');
const cache = require('../../../utilities/cache');
const logger = require('../../../utilities/logger');

const API_KEY = process.env.API_KEY;
const CATEGORIES_URL = process.env.CATEGORIES_URL;
const PRODUCT_TYPE = process.env.PRODUCT_TYPE;

async function fetchAndCacheCategories() {
  const cacheKey = cache.key('lightspeed', 'categories', 'v1');

  try {
    const cachedCategories = await cache.get(cacheKey);
    if (cachedCategories) {
      logger.info('Fetching categories from cache');
      return cachedCategories;
    }

    logger.info('Fetching categories from Lightspeed API');

    const categoriesResponse = await axios.get(CATEGORIES_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    });

    const categories =
      categoriesResponse.data.data?.data?.categories || [];

    // 30 minutes — matches previous NodeCache stdTTL
    await cache.set(cacheKey, categories, 1800);

    return categories;
  } catch (error) {
    logger.warn(
      { err: error.message },
      'Error fetching categories from Lightspeed'
    );

    if (error.response && error.response.status >= 500) {
      throw new Error('Server error while fetching categories');
    }

    throw new Error('Failed to fetch categories');
  }
}

async function fetchCategoriesType(id) {
  // Lightspeed call for a product_type (category) — one external HTTP hit per
  // category view. Categories change rarely; 30 min TTL is safe.
  const cacheKey = cache.key('lightspeed', 'product-type', String(id), 'v1');
  return cache.getOrSet(cacheKey, 1800, async () => {
    try {
      const categoriesResponse = await axios.get(PRODUCT_TYPE + '/' + id, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      });
      return categoriesResponse.data || [];
    } catch (error) {
      logger.warn(
        { err: error.message },
        'Error fetching products from Lightspeed'
      );
      return [];
    }
  });
}

module.exports = { fetchAndCacheCategories, fetchCategoriesType, cache };
