'use strict';

const { getCoupons } = require('./use-cases/getCoupons');
const { getCouponCount } = require('./use-cases/getCouponCount');
const { updateCouponCount } = require('./use-cases/updateCouponCount');
const { checkCouponCode } = require('./use-cases/checkCouponCode');
const { redeemCoupon } = require('./use-cases/redeemCoupon');
const { createCoupon } = require('./use-cases/createCoupon');

module.exports = {
    getCoupons,
    getCouponCount,
    updateCouponCount,
    checkCouponCode,
    redeemCoupon,
    createCoupon,
};
