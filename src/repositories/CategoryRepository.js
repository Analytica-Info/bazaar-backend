const Category = require('../models/Category');
const BaseRepository = require('./BaseRepository');

class CategoryRepository extends BaseRepository {
    constructor() {
        super(Category);
    }

    /**
     * Categories is a singleton-ish collection — fetch the single document and
     * return only the search list array.
     */
    async getSearchCategoriesList() {
        const doc = await this.model.findOne().select('search_categoriesList').lean();
        return doc && Array.isArray(doc.search_categoriesList) ? doc.search_categoriesList : [];
    }
}

module.exports = CategoryRepository;
