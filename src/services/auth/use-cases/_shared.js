'use strict';

/**
 * _shared.js — helpers used across multiple auth use-cases.
 *
 * Not exported from the barrel — internal only.
 */

const { isValidPassword } = require('../../../helpers/validator');
const User = require('../../../repositories').users.rawModel();
const Order = require('../../../repositories').orders.rawModel();
const Coupon = require('../../../repositories').coupons.rawModel();
const CouponMobile = require('../../../repositories').couponsMobile.rawModel();

/**
 * Generate a 6-digit numeric verification code.
 * @returns {string}
 */
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Fetch coupon status for a user.
 * Mobile uses the CouponMobile model; ecommerce uses the Coupon model.
 *
 * @param {string|null} phone
 * @param {'mobile'|'web'} platform
 * @returns {Promise<{ status: boolean, data: object|[] }>}
 */
async function getCouponStatus(phone, platform) {
    let state = false;
    let dataCoupon = [];
    if (!phone) return { status: state, data: dataCoupon };
    const CouponModel = platform === 'mobile' ? CouponMobile : Coupon;
    const couponData = await CouponModel.findOne({ phone });
    if (couponData) {
        state = true;
        dataCoupon = couponData;
    }
    return { status: state, data: dataCoupon };
}

module.exports = { generateVerificationCode, getCouponStatus, isValidPassword, User, Order, Coupon, CouponMobile };
