const BrandsLogo = require('../models/BrandsLogo');
const BaseRepository = require('./BaseRepository');

class BrandsLogoRepository extends BaseRepository {
    constructor() { super(BrandsLogo); }
}

module.exports = BrandsLogoRepository;
