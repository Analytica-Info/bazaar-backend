const ProductView = require('../models/ProductView');
const BaseRepository = require('./BaseRepository');

class ProductViewRepository extends BaseRepository {
    constructor() { super(ProductView); }
}

module.exports = ProductViewRepository;
