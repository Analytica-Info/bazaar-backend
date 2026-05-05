'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { escapeRegex } = require('../../../utilities/stringUtils');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');

/**
 * Admin: products missing images
 */
async function fetchProductsNoImages(query) {
  try {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = query.search || '';

    const safeSearchQuery = escapeRegex(searchQuery);

    let dbQuery = {
      $or: [
        { 'product.images': { $exists: false } },
        { 'product.images': null },
        { 'product.images': [] },
        {
          $expr: {
            $eq: [
              { $size: { $ifNull: ['$product.images', []] } },
              0,
            ],
          },
        },
      ],
    };

    if (searchQuery) {
      const searchCondition = {
        'product.name': {
          $regex: `.*${safeSearchQuery}.*`,
          $options: 'i',
        },
      };

      dbQuery = {
        $and: [dbQuery, searchCondition],
      };
    }

    const products = await Product.find(dbQuery)
      .select(LIST_EXCLUDE_SELECT)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalCount = await Product.countDocuments(dbQuery).exec();

    return {
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      products,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching products with no images:');
    throw {
      status: 500,
      message: 'Failed to fetch products with no images',
    };
  }
}

module.exports = { fetchProductsNoImages };
