'use strict';

const Product = require('../../../repositories').products.rawModel();
const Category = require('../../../repositories').categories.rawModel();
const logger = require('../../../utilities/logger');

/**
 * Full category tree
 */
async function getAllCategories() {
  try {
    logger.info('API - All Categories');

    const categories = await Category.find();
    // Only need product_type_id, totalQty for category counting — strip everything else.
    // Status filter pushed to DB (was loading all then filtering in JS).
    const allProducts = await Product.find({ status: true })
      .select('product.product_type_id totalQty')
      .lean();

    const productCountMap = {};
    allProducts.forEach((product) => {
      const productTypeId = product.product.product_type_id;
      if (!productCountMap[productTypeId]) {
        productCountMap[productTypeId] = 0;
      }

      if (product.totalQty > 0) {
        productCountMap[productTypeId]++;
      }
    });

    const categoryTree = {};
    const flatCategoryList = [];

    categories.forEach((category) => {
      const path = category.category_path;
      if (path && path.length > 0) {
        let currentLevel = categoryTree;
        const fullCategoryPath = [];

        path.forEach((categoryItem) => {
          const productTypeId = categoryItem.id;
          const qty = productCountMap[productTypeId] || 0;

          fullCategoryPath.push(categoryItem.name);

          if (!currentLevel[categoryItem.id]) {
            currentLevel[categoryItem.id] = {
              id: categoryItem.id,
              name: categoryItem.name,
              qty: 0,
              sub_categories: {},
            };
          }

          currentLevel[categoryItem.id].qty += qty;

          currentLevel = currentLevel[categoryItem.id].sub_categories;
        });

        flatCategoryList.push({
          id: category.id,
          name: fullCategoryPath.join(' / '),
          qty: productCountMap[category.id] || 0,
        });
      }
    });

    const aggregateSubCategoryQuantities = (category) => {
      let totalQty = category.qty;

      for (const subCategoryId in category.sub_categories) {
        const subCategory = category.sub_categories[subCategoryId];
        totalQty += aggregateSubCategoryQuantities(subCategory);
      }

      category.qty = totalQty;

      return totalQty;
    };

    Object.values(categoryTree).forEach((category) => {
      aggregateSubCategoryQuantities(category);
    });

    const convertToArray = (obj) => {
      return Object.values(obj).map((item) => ({
        ...item,
        sub_categories: convertToArray(item.sub_categories),
      }));
    };

    const finalCategoryTree = convertToArray(categoryTree);

    flatCategoryList.sort((a, b) => a.name.localeCompare(b.name));

    logger.info('Return - API - All Categories');
    return {
      side_bar_categories: finalCategoryTree,
      search_categoriesList: flatCategoryList,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching categories or products:');
    throw {
      status: 500,
      message: 'Failed to fetch categories or products',
    };
  }
}

module.exports = { getAllCategories };
