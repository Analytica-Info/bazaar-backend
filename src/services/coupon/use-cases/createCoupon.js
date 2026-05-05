'use strict';

const Coupon = require('../../../repositories').coupons.rawModel();
const CouponsCount = require('../../../repositories').couponsCount.rawModel();
const { sendEmail } = require('../../../mail/emailService');
const { getAdminEmail, getCcEmails } = require('../../../utilities/emailHelper');
const clock = require('../../../utilities/clock');
const { generateCouponCode } = require('../domain/couponCode');
const { buildCouponAlertHtml, buildNewCouponHtml } = require('../templates/couponEmailHtml');

const WEBURL = process.env.URL;

/**
 * Generate personalized coupon
 * @param {string} userId
 * @param {Object} data - { name, phone }
 */
async function createCoupon(userId, data) {
    try {
        const { name, phone } = data;

        if (!name || !phone) {
            throw { status: 400, message: "Name and phone are required." };
        }

        const existingUser = await Coupon.findOne({ phone });
        if (existingUser) {
            throw { status: 400, message: "Phone already exists" };
        }

        const couponsCountDoc = await CouponsCount.findOne();
        const totalCouponLimit = couponsCountDoc.count;
        const currentCouponCount = await Coupon.countDocuments();
        const remainingCoupons = totalCouponLimit - currentCouponCount;

        if (remainingCoupons <= 0) {
            throw { status: 400, message: "All coupons have been claimed. No more coupons available." };
        }

        const lastCoupon = await Coupon.findOne().sort({ _id: -1 }).select("id").lean();
        const nextId = lastCoupon && typeof lastCoupon.id === "number" ? lastCoupon.id + 1 : 1;

        const couponCode = await generateCouponCode();
        const discount = 10;
        const validFrom = clock.now();
        const validUntil = new Date(validFrom);
        validUntil.setMonth(validFrom.getMonth() + 1);

        const newCoupon = new Coupon({ id: nextId, coupon: couponCode, name, phone, user_id: userId, discount, validFrom, validUntil, isActive: true });
        await newCoupon.save();

        const logoUrl = `${WEBURL}/images/logo.png`;

        if (remainingCoupons <= 10) {
            const adminEmail = await getAdminEmail();
            const ccEmail = await getCcEmails();
            const alertHtml = buildCouponAlertHtml({ logoUrl, totalCouponLimit, currentCouponCount, remainingCoupons });
            await sendEmail(adminEmail, "ALERT: Only 10 Coupons Remaining - Bazaar", alertHtml, ccEmail);
        }

        const adminEmail = await getAdminEmail();
        const adminHtml = buildNewCouponHtml({ logoUrl, name, phone, couponCode });
        await sendEmail(adminEmail, "New Coupon Code Generated - Bazaar", adminHtml);

        return { success: true, message: "Coupon created successfully.", coupon: newCoupon };
    } catch (error) {
        if (error.status) throw error;
        console.error(error);
        throw { status: 500, message: "Error creating coupon." };
    }
}

module.exports = { createCoupon };
