'use strict';

const Product = require('../../../repositories').products.rawModel();
const logger = require('../../../utilities/logger');
const { fetchAndCacheCategories } = require('../adapters/cache');
const { cache } = require('../adapters/cache');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');

/**
 * Home page products grouped by category
 */
async function getHomeProducts() {
  try {
    logger.info('API - Fetch Home Products');

    return await cache.getOrSet(
      cache.key('catalog', 'home-products', 'v1'),
      300, // 5-minute TTL — same as other smart-category endpoints
      async () => {
        const categories = await fetchAndCacheCategories();
        // Full product load is required here because the grouping is done in JS
        // (products are bucketed by product_type_id across arbitrary subcategories).
        // The cache wrapper above ensures this only hits MongoDB once per 5 minutes.
        const products = await Product.find({ status: true })
          .select(LIST_EXCLUDE_SELECT)
          .lean();

        const sortedCategories = {};
        const categoryLookup = Object.fromEntries(
          categories.map((category) => [category.id, category.name])
        );

        categories.forEach((category) => {
          if (category.parent_category_id === null) {
            sortedCategories[category.name] = {
              id: category.id,
              name: category.name,
              sub_categories: [],
            };
          } else {
            const rootName = categoryLookup[category.root_category_id];
            if (rootName && sortedCategories[rootName]) {
              sortedCategories[rootName].sub_categories.push({
                id: category.id,
                name: category.name,
              });
            }
          }
        });

        const result = {};
        const categoriesArrays = {
          Electronics: 'eb38712b-3652-4969-b34b-4389e770de4c',
          Home: '0aa39cca-853e-46cc-a7a0-2cddcc11cc70',
          'Home Improvement': '7bf90217-e79a-46ec-9aa3-5231071b487f',
          'Sports, Fitness & Outdoors': '5ce3bbd8-28cf-4643-b871-1f28a0eb216c',
          Toys: 'ada654b6-9fb7-4c6f-bf40-1bae7c6dcbc6',
        };

        for (const [key, categoryId] of Object.entries(categoriesArrays)) {
          if (sortedCategories[key]) {
            const subcategories = sortedCategories[key].sub_categories;
            const subcategoriesWithProductCount = [];
            const getRandomItems = (array, count) => {
              const shuffled = array.sort(() => 0.5 - Math.random());
              return shuffled.slice(0, count);
            };

            subcategories.forEach((subcategory) => {
              const subcategoryProducts = products.filter(
                (product) =>
                  product.product.product_type_id === subcategory.id
              );
              subcategoriesWithProductCount.push({
                id: subcategory.id,
                name: subcategory.name,
                product_count: subcategoryProducts.length,
                products: getRandomItems(subcategoryProducts, 24),
              });
            });

            subcategoriesWithProductCount.sort(
              (a, b) => b.product_count - a.product_count
            );
            result[key] = {
              sub_categories: subcategoriesWithProductCount.slice(0, 4),
            };
          }
        }

        const uncategorizedProducts = products.filter(
          (product) => product.product.product_type_id === null
        );
        if (uncategorizedProducts.length > 0) {
          result['Uncategorized'] = {
            sub_categories: [
              {
                id: 'null-subcategory-id',
                name: 'Uncategorized',
                products: uncategorizedProducts.slice(0, 24),
              },
            ],
          };
        }

        logger.info('Return - API - Fetch Home Products');
        return { result };
      }
    ); // end cache.getOrSet
  } catch (error) {
    logger.error({ err: error }, 'Error fetching products:');
    throw { status: 500, message: 'Failed to fetch home products' };
  }
}

module.exports = { getHomeProducts };
