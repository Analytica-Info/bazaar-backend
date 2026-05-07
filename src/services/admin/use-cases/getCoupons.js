'use strict';

const Coupon = require('../../../repositories').coupons.rawModel();
const logger = require('../../../utilities/logger');

module.exports = async function getCoupons() {
    logger.info('API - Coupons');
    const coupons = await Coupon.find();
    if (coupons.length === 0) {
        throw { status: 404, message: 'No coupons found.' };
    }
    logger.info('Return - API - Coupons');
    return coupons;
};
