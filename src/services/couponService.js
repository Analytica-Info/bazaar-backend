'use strict';

/**
 * Coupon service facade.
 *
 * Thin re-export layer — all logic lives in src/services/coupon/.
 * Controllers import from here; the public API is unchanged.
 *
 * NOTE: BUG-005 (`<` vs `<=` on expiry check) is preserved in checkCouponCode.js.
 */

const {
    getCoupons,
    getCouponCount,
    updateCouponCount,
    checkCouponCode,
    redeemCoupon,
    createCoupon,
} = require('./coupon');

exports.getCoupons = getCoupons;
exports.getCouponCount = getCouponCount;
exports.updateCouponCount = updateCouponCount;
exports.checkCouponCode = checkCouponCode;
exports.redeemCoupon = redeemCoupon;
exports.createCoupon = createCoupon;
