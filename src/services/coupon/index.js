'use strict';

const { getCoupons } = require('./use-cases/getCoupons');
const { getCouponCount } = require('./use-cases/getCouponCount');
const { updateCouponCount } = require('./use-cases/updateCouponCount');
const { checkCouponCode } = require('./use-cases/checkCouponCode');
const { redeemCoupon } = require('./use-cases/redeemCoupon');
const { createCoupon } = require('./use-cases/createCoupon');

const { validate } = require('./use-cases/validate');
const { apply } = require('./use-cases/apply');
const { redeem: redeemV2 } = require('./use-cases/redeem');
const { release } = require('./use-cases/release');
const { eligible } = require('./use-cases/eligible');
const { evaluateAuto } = require('./use-cases/evaluateAuto');
const { grant } = require('./use-cases/grant');
const v1Adapter = require('./v1-adapter');

module.exports = {
    getCoupons,
    getCouponCount,
    updateCouponCount,
    checkCouponCode,
    redeemCoupon,
    createCoupon,
    // v2 engine
    validate,
    apply,
    redeemV2,
    release,
    eligible,
    evaluateAuto,
    grant,
    v1Adapter,
};
