'use strict';

const CouponCms = require('../../../repositories').couponCms.rawModel();
const logger = require('../../../utilities/logger');

/**
 * Get coupon CMS data
 */
async function getCouponCms() {
    try {
        const couponCms = await CouponCms.findOne();
        if (!couponCms) {
            throw { status: 404, message: "CouponCms data not found" };
        }
        return { couponCmsData: couponCms };
    } catch (error) {
        if (error.status) throw error;
        logger.error(`Error fetching CouponCms data: ${error.message}`);
        throw { status: 500, message: "Error fetching CouponCms data" };
    }
}

module.exports = { getCouponCms };
