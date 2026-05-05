'use strict';

const CouponsCount = require('../../../repositories').couponsCount.rawModel();

/**
 * Get CouponsCount total
 */
async function getCouponCount() {
    try {
        const newCouponCount = await CouponsCount.findOne();
        if (!newCouponCount) {
            throw { status: 404, message: "Coupon count data not found" };
        }
        return { couponCountData: newCouponCount };
    } catch (error) {
        if (error.status) throw error;
        console.error(error);
        throw { status: 500, message: "Error fetching coupon count" };
    }
}

module.exports = { getCouponCount };
