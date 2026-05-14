'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { fetchAndCacheCategories, fetchCategoriesType } = require('../adapters/cache');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');
const { logStatusFalseItems } = require('../domain/statusLogger');

/**
 * Products by subcategory (with pagination)
 */
async function getSubCategoriesProduct(subCategoryId, query) {
  const page = parseInt(query?.page) || 1;
  const limit = parseInt(query?.limit) || 20;

  try {
    let categories = await fetchAndCacheCategories();
    const categoriesTypes = await fetchCategoriesType(subCategoryId);

    // Resolve target sub-category IDs BEFORE touching the DB.
    const categoryIds = [];
    categories.forEach((category) => {
      if (
        category.category_path[1] &&
        category.category_path[1].id === subCategoryId
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

    if (uniqueCategoryIds.length === 0) {
      return {
        success: true,
        categories,
        categoryId: subCategoryId,
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

    // Push every filter to MongoDB.
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
      categoryId: subCategoryId,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: filteredProductsCount,
        productsPerPage: limit,
      },
      filteredProductsCount,
      filteredProducts: paginatedProducts,
    };

    logStatusFalseItems('/api/products/subCategoriesProduct', {}, responseData);

    return responseData;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching categories or products:');
    throw {
      status: 500,
      message: 'Failed to fetch categories or products',
    };
  }
}

module.exports = { getSubCategoriesProduct };
