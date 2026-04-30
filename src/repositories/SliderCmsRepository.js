const SliderCms = require('../models/SliderCms');
const BaseRepository = require('./BaseRepository');

class SliderCmsRepository extends BaseRepository {
    constructor() { super(SliderCms); }
}

module.exports = SliderCmsRepository;
