const FooterInfoCms = require('../models/FooterInfoCms');
const BaseRepository = require('./BaseRepository');

class FooterInfoCmsRepository extends BaseRepository {
    constructor() { super(FooterInfoCms); }
}

module.exports = FooterInfoCmsRepository;
