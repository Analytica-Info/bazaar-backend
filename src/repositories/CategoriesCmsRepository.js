const CategoriesCms = require('../models/CategoriesCms');
const BaseRepository = require('./BaseRepository');

class CategoriesCmsRepository extends BaseRepository {
    constructor() { super(CategoriesCms); }
}

module.exports = CategoriesCmsRepository;
