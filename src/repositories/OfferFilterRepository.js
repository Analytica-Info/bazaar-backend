const OfferFilter = require('../models/OfferFilter');
const BaseRepository = require('./BaseRepository');

class OfferFilterRepository extends BaseRepository {
    constructor() { super(OfferFilter); }
}

module.exports = OfferFilterRepository;
