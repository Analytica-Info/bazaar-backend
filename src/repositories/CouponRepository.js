const Coupon = require('../models/Coupon');
const BaseRepository = require('./BaseRepository');

class CouponRepository extends BaseRepository {
    constructor() {
        super(Coupon);
    }

    findByPhone(phone, { lean = true } = {}) {
        if (!phone) return Promise.resolve(null);
        const q = this.model.findOne({ phone });
        return lean ? q.lean().exec() : q.exec();
    }
}

module.exports = CouponRepository;
