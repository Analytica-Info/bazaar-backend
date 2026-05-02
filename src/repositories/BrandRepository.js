const Brand = require('../models/Brand');
const BaseRepository = require('./BaseRepository');

class BrandRepository extends BaseRepository {
    constructor() { super(Brand); }
}

module.exports = BrandRepository;
