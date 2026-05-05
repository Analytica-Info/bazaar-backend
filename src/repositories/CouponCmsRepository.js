const CouponCms = require('../models/CouponCms');
const BaseRepository = require('./BaseRepository');

class CouponCmsRepository extends BaseRepository {
    constructor() { super(CouponCms); }
}

module.exports = CouponCmsRepository;
