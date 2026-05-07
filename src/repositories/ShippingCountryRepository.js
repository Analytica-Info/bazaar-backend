const ShippingCountry = require('../models/ShippingCountry');
const BaseRepository = require('./BaseRepository');

class ShippingCountryRepository extends BaseRepository {
    constructor() { super(ShippingCountry); }
}

module.exports = ShippingCountryRepository;
