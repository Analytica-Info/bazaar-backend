'use strict';

const Category = require('../../../repositories').categories.rawModel();

/**
 * Sidebar + search categories
 */
async function getCategories() {
  try {
    const categories = await Category.find();
    if (categories.length === 0) {
      throw { status: 404, message: 'No categories found.' };
    }

    return {
      success: true,
      side_bar_categories: categories[0].side_bar_categories,
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

module.exports = { getCategories };
