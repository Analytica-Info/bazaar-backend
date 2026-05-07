'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { fetchCategoriesType } = require('../adapters/cache');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');
const { logStatusFalseItems } = require('../domain/statusLogger');

/**
 * Products by sub-subcategory (with pagination)
 */
async function getSubSubCategoriesProduct(subSubCategoryId, query) {
  const page = parseInt(query?.page) || 1;
  const limit = parseInt(query?.limit) || 20;

  try {
    let categories = [];

    // Push every filter to MongoDB — exact match on product_type_id.
    const baseQuery = {
      totalQty: { $gt: 0 },
      status: true,
      'product.product_type_id': subSubCategoryId,
      'product.images.0': { $exists: true },
    };

    // Push pagination to MongoDB (same pattern as getCategoriesProduct / getSubCategoriesProduct).
    // countDocuments + paginated find in parallel — avoids loading the full category into memory.
    const skip = (page - 1) * limit;
    const [filteredProductsCount, paginatedProducts, categoriesTypes] =
      await Promise.all([
        Product.countDocuments(baseQuery),
        Product.find(baseQuery)
          .select(LIST_EXCLUDE_SELECT)
          .skip(skip)
          .limit(limit)
          .lean(),
        fetchCategoriesType(subSubCategoryId),
      ]);

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

    const totalPages = Math.ceil(filteredProductsCount / limit);

    const responseData = {
      success: true,
      categories,
      categoryId: subSubCategoryId,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: filteredProductsCount,
        productsPerPage: limit,
      },
      filteredProductsCount,
      filteredProducts: paginatedProducts,
    };

    logStatusFalseItems(
      '/api/products/subSubCategoriesProduct',
      {},
      responseData
    );

    return responseData;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching categories or products:');
    throw {
      status: 500,
      message: 'Failed to fetch categories or products',
    };
  }
}

module.exports = { getSubSubCategoriesProduct };
