'use strict';

const CouponsCount = require('../../../repositories').couponsCount.rawModel();

/**
 * Increment coupon count
 * @param {number} count - the number to increment by
 */
async function updateCouponCount(count) {
    try {
        if (typeof count !== "number") {
            throw { status: 400, message: "Count must be a number" };
        }

        const updatedCouponCount = await CouponsCount.findOneAndUpdate(
            {},
            { $inc: { count } },
            { new: true, upsert: true }
        );

        return { message: "Coupon count updated successfully", data: updatedCouponCount };
    } catch (error) {
        if (error.status) throw error;
        console.error(error);
        throw { status: 500, message: "Error updating coupon count" };
    }
}

module.exports = { updateCouponCount };
