'use strict';

const Coupon = require('../../../repositories').coupons.rawModel();
const logger = require('../../../utilities/logger');

/**
 * Generate the next sequential coupon code in the DH{N}YHZXB series.
 */
async function generateCouponCode() {
    try {
        const lastCouponDoc = await Coupon.findOne({ coupon: /^DH\d+YHZXB$/ })
            .sort({ _id: -1 })
            .select("coupon")
            .lean();

        let nextNumber = 1;
        if (lastCouponDoc) {
            const matches = lastCouponDoc.coupon.match(/DH(\d+)YHZXB/);
            if (matches && matches[1]) {
                nextNumber = parseInt(matches[1], 10) + 1;
            }
        }

        return `DH${nextNumber}YHZXB`;
    } catch (error) {
        logger.error({ err: error }, "Error generating the coupon code:");
        return "DH1YHZXB";
    }
}

module.exports = { generateCouponCode };
