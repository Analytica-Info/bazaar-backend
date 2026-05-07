const ProductId = require('../models/ProductId');
const BaseRepository = require('./BaseRepository');

class ProductIdRepository extends BaseRepository {
    constructor() { super(ProductId); }
}

module.exports = ProductIdRepository;
