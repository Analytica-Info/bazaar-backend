'use strict';

const Category = require('../../../repositories').categories.rawModel();
const logger = require('../../../utilities/logger');

/**
 * Category name lookup
 */
async function getCategoryNameById(id) {
  try {
    const categoryDoc = await Category.findOne({
      search_categoriesList: { $elemMatch: { id } },
    });

    if (!categoryDoc) {
      throw { status: 404, message: 'Category ID not found' };
    }

    const item = categoryDoc.search_categoriesList.find(
      (cat) => cat.id === id
    );

    if (!item) {
      throw {
        status: 404,
        message: 'ID found in doc but not in array',
      };
    }

    const mainCategory = item.name.split(/\s*\/\s*/)[0];

    return { name: mainCategory };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Error fetching category name:');
    throw { status: 500, message: 'Server error' };
  }
}

module.exports = { getCategoryNameById };
