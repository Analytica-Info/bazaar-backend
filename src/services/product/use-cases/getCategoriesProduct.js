'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { fetchAndCacheCategories, fetchCategoriesType } = require('../adapters/cache');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');
const { logStatusFalseItems } = require('../domain/statusLogger');

/**
 * Products by category (with pagination)
 */
async function getCategoriesProduct(categoryId, query) {
  const page = parseInt(query?.page) || 1;
  const limit = parseInt(query?.limit) || 20;

  try {
    let categories = await fetchAndCacheCategories();
    const categoriesTypes = await fetchCategoriesType(categoryId);

    // Build the list of category IDs that are descendants of `categoryId`
    // BEFORE we touch the DB, so we can push the filter down to Mongo.
    const categoryIds = [];
    categories.forEach((category) => {
      if (
        category.category_path[0] &&
        category.category_path[0].id === categoryId
      ) {
        category.category_path.forEach((path) => {
          categoryIds.push(path.id);
        });
      }
    });

    if (
      categoriesTypes &&
      categoriesTypes.data &&
      Array.isArray(categoriesTypes.data.category_path) &&
      categoriesTypes.data.category_path.length > 0
    ) {
      const categoryPath = categoriesTypes.data.category_path;
      categories = categoryPath.map((category) => ({
        id: category.id,
        name: category.name,
      }));
    } else {
      categories = null;
    }

    const uniqueCategoryIds = [...new Set(categoryIds)];

    // If no categories resolved, short-circuit — nothing to return.
    if (uniqueCategoryIds.length === 0) {
      return {
        success: true,
        categories,
        categoryId,
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalProducts: 0,
          productsPerPage: limit,
        },
        filteredProductsCount: 0,
        filteredProducts: [],
      };
    }

    // Push every filter to MongoDB. Uses:
    //   - { status, totalQty, discountedPrice } compound index
    //   - { "product.product_type_id": 1 } index
    // We get only the page we need instead of loading ~2000 docs + slicing.
    const baseQuery = {
      totalQty: { $gt: 0 },
      status: true,
      discountedPrice: { $exists: true, $gt: 0 },
      'product.product_type_id': { $in: uniqueCategoryIds },
      'product.images.0': { $exists: true },
    };

    const [paginatedProducts, filteredProductsCount] = await Promise.all([
      Product.find(baseQuery)
        .select(LIST_EXCLUDE_SELECT)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(baseQuery),
    ]);

    const totalPages = Math.ceil(filteredProductsCount / limit);

    const responseData = {
      success: true,
      categories,
      categoryId,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: filteredProductsCount,
        productsPerPage: limit,
      },
      filteredProductsCount,
      filteredProducts: paginatedProducts,
    };

    logStatusFalseItems('/api/products/categoriesProduct', {}, responseData);

    return responseData;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching categories or products:');
    throw {
      status: 500,
      message: 'Failed to fetch categories or products',
    };
  }
}

module.exports = { getCategoriesProduct };
