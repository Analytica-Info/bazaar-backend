const FlashSale = require('../models/FlashSale');
const BaseRepository = require('./BaseRepository');

class FlashSaleRepository extends BaseRepository {
    constructor() { super(FlashSale); }
}

module.exports = FlashSaleRepository;
