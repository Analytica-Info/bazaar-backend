const Shop = require('../models/Shop');
const BaseRepository = require('./BaseRepository');

class ShopRepository extends BaseRepository {
    constructor() { super(Shop); }
}

module.exports = ShopRepository;
