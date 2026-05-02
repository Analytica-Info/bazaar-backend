'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { LIST_EXCLUDE_PROJECTION } = require('../domain/projections');

/**
 * Paginated product listing (based on mobile version, enhanced with web version features)
 */
async function getProducts(query) {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 54;
  const filter = query.filter;
  const minPrice = parseFloat(query.minPrice);
  const maxPrice = parseFloat(query.maxPrice);

  let matchStage = {
    totalQty: { $gt: 0 },
    $or: [{ status: { $exists: false } }, { status: true }],
  };

  if (!isNaN(minPrice) && !isNaN(maxPrice)) {
    matchStage.discountedPrice = {
      $gte: minPrice,
      $lte: maxPrice,
      $gt: 0,
    };
  }

  let aggregationPipeline = [];

  aggregationPipeline.push({ $match: matchStage });

  aggregationPipeline.push({
    $match: {
      $expr: {
        $gt: [{ $size: { $ifNull: ['$product.images', []] } }, 0],
      },
    },
  });

  if (filter && filter.length > 0 && filter !== '[]') {
    try {
      const filterWords = JSON.parse(filter);
      if (filterWords.length > 0) {
        const words = filterWords.map((word) => word.toLowerCase());

        aggregationPipeline.push({
          $match: {
            'variantsData.sku': {
              $regex: new RegExp(`^(${words.join('|')}) - .*`, 'i'),
            },
          },
        });
      }
    } catch (error) {
      logger.error({ err: error }, 'Error parsing filter:');
    }
  }

  try {
    const countPipeline = [...aggregationPipeline, { $count: 'total' }];
    const countResult = await Product.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    const productsPipeline = [
      ...aggregationPipeline,
      { $addFields: { randomSort: { $rand: {} } } },
      { $sort: { randomSort: 1 } },
      { $project: { randomSort: 0 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: LIST_EXCLUDE_PROJECTION },
    ];

    const products = await Product.aggregate(productsPipeline);
    const totalPages = Math.ceil(totalCount / limit);

    return {
      success: true,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: totalCount,
        productsPerPage: limit,
      },
      products,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching products:');
    throw { status: 500, message: 'An error occurred while fetching products' };
  }
}

module.exports = { getProducts };
