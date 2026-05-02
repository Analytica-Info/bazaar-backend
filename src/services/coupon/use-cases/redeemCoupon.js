'use strict';

const Coupon = require('../../../repositories').coupons.rawModel();
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');
const { fetchCouponDetails } = require('../domain/fetchCouponDetails');

const UAE10_PROMOTION_ID = "1991824943058366464";

/**
 * Verify coupon eligibility (redeem step)
 * @param {string} userId - unused currently
 * @param {string} coupon - the coupon code
 * @param {string} phone - mobile number
 */
async function redeemCoupon(userId, coupon, phone) {
    if (!coupon) {
        throw { status: 400, message: "Coupon code is required." };
    }

    if (coupon === "UAE10") {
        const couponDetails = await fetchCouponDetails(UAE10_PROMOTION_ID);
        if (!couponDetails) {
            throw { status: 404, message: "Coupon details not found." };
        }

        const { start_time, end_time, status } = couponDetails;
        const currentDubaiTime = new Date(clock.now().toLocaleString("en-US", { timeZone: "Asia/Dubai" }));
        const startTime = new Date(start_time);
        const endTime = new Date(end_time);

        if (status !== "active") {
            throw { status: 400, message: "This promotion is not active." };
        }
        if (currentDubaiTime < startTime) {
            throw { status: 400, message: "Promotion has not started yet." };
        }
        if (currentDubaiTime > endTime) {
            throw { status: 400, message: "Promotion has expired." };
        }

        return { message: "Coupon code is valid." };
    }

    if (!coupon || !phone) {
        throw { status: 400, message: "Coupon code and mobile number are required." };
    }

    try {
        const couponDoc = await Coupon.findOne({ coupon, phone });
        if (couponDoc) {
            return { message: "Coupon code is valid. Please proceed with the payment." };
        } else {
            throw {
                status: 404,
                message: "Coupon code is not valid or not associated with this mobile number.",
            };
        }
    } catch (error) {
        if (error.status) throw error;
        logger.error({ err: error }, "Error redeeming coupon:");
        throw { status: 500, message: "Internal server error." };
    }
}

module.exports = { redeemCoupon };
