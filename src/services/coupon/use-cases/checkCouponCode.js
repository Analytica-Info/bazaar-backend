'use strict';

const Coupon = require('../../../repositories').coupons.rawModel();
const BankPromoCode = require('../../../repositories').bankPromoCodes.rawModel();
const BankPromoCodeUsage = require('../../../repositories').bankPromoCodeUsages.rawModel();
const User = require('../../../repositories').users.rawModel();
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');
const { fetchCouponDetails } = require('../domain/fetchCouponDetails');

const UAE10_PROMOTION_ID = "1991824943058366464";

// Cap constants for hardcoded promo codes (server-driven tuning via Coupon model is
// available for DB-backed coupons; for hardcoded codes use these constants).
const FIRST15_CAP_AED = 30;
const UAE10_CAP_AED = null; // no documented cap

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
    // Case-insensitive matching for all V1 paths. The legacy `Coupon` collection
    // stores codes uppercase (DH*YHZXB pattern + 'FIRST15' seed), and the hardcoded
    // promo IDs ('UAE10', 'FIRST15') are uppercase string literals — so we normalise
    // user input to uppercase for the literal comparisons and use a case-insensitive
    // regex for the DB lookup. BankPromoCode already normalises (uppercase: true on
    // the schema + .toUpperCase() on the query below).
    const codeUpper = codeTrimmed.toUpperCase();
    // Escape regex special chars so a user typing e.g. 'first15.' doesn't construct
    // a pattern with a real `.` wildcard against the unique index.
    const codeRegex = new RegExp(`^${codeUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    if (codeUpper === "FIRST15") {
        // FIRST15 is a hardcoded universal-per-user first-purchase promo —
        // there is no `Coupon` document for it in the collection. Gate on
        // the User-level `usedFirst15Coupon` flag (set after first paid order
        // via order/use-cases/markCouponUsed.js). Anonymous callers (no userId)
        // are accepted optimistically; the markCouponUsed step at order time
        // is the authoritative single-use enforcement.
        if (userId) {
            const user = await User.findById(userId).select('usedFirst15Coupon').lean();
            if (user && user.usedFirst15Coupon) {
                throw { status: 400, message: "FIRST15 coupon is already used." };
            }
        }
        return { success: true, message: "Coupon code is valid.", type: "coupon", discountPercent: 10, capAED: FIRST15_CAP_AED };
    }

    if (codeUpper === "UAE10") {
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
        return { success: true, message: "Coupon code is valid.", type: "coupon", discountPercent: 10, capAED: UAE10_CAP_AED };
    }

    try {
        const coupon = await Coupon.findOne({ coupon: codeRegex, status: "unused" });
        if (coupon) {
            // BUG-041 fix
            const capForCode = codeUpper === "FIRST15" ? FIRST15_CAP_AED : (coupon.capAED ?? null);
            return { success: true, message: "Coupon code is valid.", type: "coupon", discountPercent: 10, capAED: capForCode };
        }

        const promoCode = await BankPromoCode.findOne({
            code: codeUpper,
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
