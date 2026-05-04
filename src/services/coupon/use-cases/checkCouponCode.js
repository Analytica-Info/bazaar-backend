'use strict';

const Coupon = require('../../../repositories').coupons.rawModel();
const BankPromoCode = require('../../../repositories').bankPromoCodes.rawModel();
const BankPromoCodeUsage = require('../../../repositories').bankPromoCodeUsages.rawModel();
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');
const { fetchCouponDetails } = require('../domain/fetchCouponDetails');

const UAE10_PROMOTION_ID = "1991824943058366464";

/**
 * Validate coupon code (FIRST15, bank promos)
 * NOTE: BUG-005 — `expiry < now` uses strict less-than (not <=); preserve behavior.
 *
 * @param {string} code - the coupon code
 * @param {string} userId - the user ID (for single-use promo checks)
 * @param {Object} cartData - unused currently but passed for future use
 */
async function checkCouponCode(code, userId, cartData) {
    if (!code || !String(code).trim()) {
        throw { status: 400, message: "Coupon code is required." };
    }

    const codeTrimmed = String(code).trim();

    if (codeTrimmed === "UAE10") {
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
        // BUG-041 fix: mobile checkout_controller gates on data.success === true.
        // Strictly additive — web reads the same shape and ignores the extra key.
        return { success: true, message: "Coupon code is valid.", type: "coupon", discountPercent: 10 };
    }

    try {
        const coupon = await Coupon.findOne({ coupon: codeTrimmed, status: "unused" });
        if (coupon) {
            // BUG-041 fix
            return { success: true, message: "Coupon code is valid.", type: "coupon", discountPercent: 10 };
        }

        const promoCode = await BankPromoCode.findOne({
            code: codeTrimmed.toUpperCase(),
            active: true,
        }).lean();
        if (promoCode) {
            const now = clock.now();
            const expiry = new Date(promoCode.expiryDate);
            // BUG-005: `<` (strict) preserved — do not change to `<=`
            if (expiry < now) {
                throw { status: 400, message: "This promo code has expired." };
            }
            if (promoCode.singleUsePerCustomer && userId) {
                const alreadyUsed = await BankPromoCodeUsage.findOne({
                    bankPromoCodeId: promoCode._id,
                    userId: userId,
                });
                if (alreadyUsed) {
                    throw {
                        status: 400,
                        message: "You have already used this promo code. It is limited to one use per customer.",
                    };
                }
            }
            // BUG-041 fix
            return {
                success: true,
                message: `Promo code applied: ${promoCode.discountPercent}% off${promoCode.capAED ? ` (max ${promoCode.capAED} AED)` : ""}.`,
                type: "promo",
                discountPercent: promoCode.discountPercent,
                capAED: promoCode.capAED || null,
                bankPromoId: promoCode._id.toString(),
            };
        }

        throw { status: 404, message: "Coupon/promo code is not valid or has already been used." };
    } catch (error) {
        if (error.status) throw error;
        logger.error({ err: error }, "Error checking coupon code:");
        throw { status: 500, message: "Internal server error." };
    }
}

module.exports = { checkCouponCode };
