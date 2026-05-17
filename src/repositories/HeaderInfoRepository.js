const HeaderInfo = require('../models/HeaderInfo');
const BaseRepository = require('./BaseRepository');

class HeaderInfoRepository extends BaseRepository {
    constructor() { super(HeaderInfo); }
}

module.exports = HeaderInfoRepository;
