const FeaturesCms = require('../models/FeaturesCms');
const BaseRepository = require('./BaseRepository');

class FeaturesCmsRepository extends BaseRepository {
    constructor() { super(FeaturesCms); }
}

module.exports = FeaturesCmsRepository;
