const Coupons = require('../models/Coupons');
const BaseRepository = require('./BaseRepository');

class CouponMobileRepository extends BaseRepository {
    constructor() { super(Coupons); }
}

module.exports = CouponMobileRepository;
