const OffersCms = require('../models/OffersCms');
const BaseRepository = require('./BaseRepository');

class OffersCmsRepository extends BaseRepository {
    constructor() { super(OffersCms); }
}

module.exports = OffersCmsRepository;
