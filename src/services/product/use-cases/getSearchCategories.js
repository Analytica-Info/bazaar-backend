'use strict';

const Category = require('../../../repositories').categories.rawModel();

/**
 * Search/filter categories (mobile-specific)
 */
async function getSearchCategories(query) {
  try {
    const { category_name } = query;
    const searchTerm = (category_name || '').toLowerCase();

    const categories = await Category.find();

    if (categories.length === 0) {
      throw { status: 404, message: 'No categories found.' };
    }

    const matchedCategories = categories[0].side_bar_categories.filter(
      (category) => category.name.toLowerCase().includes(searchTerm)
    );

    return {
      success: true,
      side_bar_categories: matchedCategories,
      search_categoriesList: categories[0].search_categoriesList,
    };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw {
      status: 500,
      message: 'An error occurred while fetching categories.',
    };
  }
}

module.exports = { getSearchCategories };
