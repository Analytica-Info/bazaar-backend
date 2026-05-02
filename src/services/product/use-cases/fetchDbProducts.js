'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { escapeRegex } = require('../../../utilities/stringUtils');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');

/**
 * Admin: paginated DB products
 */
async function fetchDbProducts(query) {
  try {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = query.search || '';
    const status = query.status;
    const qty = query.qty;

    const safeSearchQuery = escapeRegex(searchQuery);

    let dbQuery = {};

    if (status !== undefined) {
      const statusValue = status === 'true' || status === true;
      dbQuery.status = statusValue;
    }

    if (qty !== undefined) {
      if (qty === '0') {
        dbQuery.totalQty = { $eq: 0 };
      } else if (qty === 'greater' || qty === 'gt') {
        dbQuery.totalQty = { $gt: 0 };
      } else if (qty === 'gte') {
        dbQuery.totalQty = { $gte: 0 };
      }
    }

    if (searchQuery) {
      const searchConditions = {
        $or: [
          {
            'product.name': {
              $regex: `.*${safeSearchQuery}.*`,
              $options: 'i',
            },
          },
          {
            'product.description': {
              $regex: `.*${safeSearchQuery}.*`,
              $options: 'i',
            },
          },
          {
            'product.sku_number': {
              $regex: `.*${safeSearchQuery}.*`,
              $options: 'i',
            },
          },
        ],
      };

      if (Object.keys(dbQuery).length > 0) {
        dbQuery = {
          $and: [dbQuery, searchConditions],
        };
      } else {
        dbQuery = searchConditions;
      }
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
    logger.error({ err: error }, 'Error fetching products:');
    throw { status: 500, message: 'Failed to fetch products' };
  }
}

module.exports = { fetchDbProducts };
