'use strict';

const Coupon = require('../../../repositories').coupons.rawModel();
const logger = require('../../../utilities/logger');

/**
 * Get coupon count (total documents)
 */
async function getCoupons() {
    try {
        logger.info({}, 'API - Coupons');
        const couponCount = await Coupon.countDocuments();
        logger.info({}, 'Return - API - Coupons');
        return { success: true, count: couponCount };
    } catch (error) {
        logger.error({ err: error }, 'getCoupons: error fetching coupon count');
        throw { status: 500, message: "An error occurred while fetching coupon count." };
    }
}

module.exports = { getCoupons };
