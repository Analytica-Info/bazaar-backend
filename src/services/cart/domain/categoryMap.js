'use strict';

const Category = require('../../../repositories').categories.rawModel();
const logger = require('../../../utilities/logger');

/**
 * Build an id→name map from the Category singleton in one query.
 * Returns an empty Map if the collection is empty or on error.
 */
async function buildCategoryMap() {
  try {
    const categoryDoc = await Category.findOne().select('search_categoriesList').lean();
    if (!categoryDoc || !Array.isArray(categoryDoc.search_categoriesList)) return new Map();
    return new Map(
      categoryDoc.search_categoriesList.map((cat) => [
        cat.id,
        cat.name.split(/\s*\/\s*/)[0],
      ])
    );
  } catch (error) {
    logger.error({ err: error }, 'Error building category map');
    return new Map();
  }
}

async function getCategoryNameById(id) {
  try {
    const categoryDoc = await Category.findOne({
      search_categoriesList: { $elemMatch: { id } },
    });
    if (!categoryDoc) return '';
    const item = categoryDoc.search_categoriesList.find((cat) => cat.id === id);
    if (!item) return '';
    return item.name.split(/\s*\/\s*/)[0];
  } catch (error) {
    logger.error({ err: error }, 'Error fetching category name');
    return '';
  }
}

module.exports = { buildCategoryMap, getCategoryNameById };
