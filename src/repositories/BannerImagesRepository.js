const { BannerImages } = require('../models/BannerImages');
const BaseRepository = require('./BaseRepository');

class BannerImagesRepository extends BaseRepository {
    constructor() { super(BannerImages); }
}

module.exports = BannerImagesRepository;
