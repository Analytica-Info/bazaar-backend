'use strict';

const couponEngine = require('../../coupon');
const logger = require('../../../utilities/logger');

/**
 * Apply and immediately redeem any auto-eligible coupons for a newly committed order.
 * Uses the v2 coupon engine (evaluateAuto → apply → redeem).
 * Never throws — order must succeed even if every coupon engine call fails.
 *
 * @param {object} params
 * @param {object} params.order  - Mongoose Order document (must have ._id)
 * @param {Array}  params.cart   - Final cart array (same shape as evaluateAuto cart param)
 * @param {string} params.user_id
 * @param {string} [params.phone]
 * @returns {Promise<Array<{redemption_id: string, coupon_code: string, discount_aed: number, status: string}>>}
 */
async function applyAutoCoupons({ order, cart, user_id, phone }) {
    const results = [];

    let winners;
    try {
        winners = await couponEngine.evaluateAuto({
            trigger: 'cart_render',
            user_id,
            phone,
            cart,
            ctx: {},
        });
    } catch (err) {
        logger.warn({ err, order_id: order._id.toString() }, 'applyAutoCoupons: evaluateAuto threw — skipping auto-coupons');
        return results;
    }

    if (!Array.isArray(winners) || winners.length === 0) {
        return results;
    }

    for (const entry of winners) {
        const couponCode = entry.coupon && entry.coupon.code;
        if (!couponCode) continue;

        const idempotency_key = `order:${order._id}:${couponCode}`;

        let applyResult;
        try {
            applyResult = await couponEngine.apply({
                code: couponCode,
                trigger: 'cart_render',
                phone,
                user_id,
                cart,
                idempotency_key,
                ctx: { server_initiated: true },
            });
        } catch (err) {
            logger.warn({ err, order_id: order._id.toString(), coupon_code: couponCode }, 'applyAutoCoupons: apply threw — skipping coupon');
            continue;
        }

        if (!applyResult || applyResult.error) {
            logger.warn({
                order_id: order._id.toString(),
                coupon_code: couponCode,
                reason: applyResult && applyResult.error,
            }, 'applyAutoCoupons: apply failed — skipping coupon');
            continue;
        }

        const { redemption_id, discount } = applyResult;

        let redeemResult;
        try {
            redeemResult = await couponEngine.redeemV2({
                redemption_id,
                order_id: order._id.toString(),
                final_cart: cart,
            });
        } catch (err) {
            logger.warn({ err, order_id: order._id.toString(), coupon_code: couponCode, redemption_id }, 'applyAutoCoupons: redeem threw — releasing reservation');
            await _safeRelease(redemption_id, user_id, order._id.toString(), couponCode);
            continue;
        }

        if (!redeemResult || !redeemResult.success) {
            logger.warn({
                order_id: order._id.toString(),
                coupon_code: couponCode,
                redemption_id,
                reason: redeemResult && redeemResult.error,
            }, 'applyAutoCoupons: redeem failed — releasing reservation');
            await _safeRelease(redemption_id, user_id, order._id.toString(), couponCode);
            continue;
        }

        results.push({
            redemption_id,
            coupon_code: couponCode,
            discount_aed: discount,
            status: 'redeemed',
        });
    }

    return results;
}

/**
 * Safely release a reserved coupon without throwing.
 * @param {string} redemption_id
 * @param {string} user_id
 * @param {string} order_id
 * @param {string} coupon_code
 */
async function _safeRelease(redemption_id, user_id, order_id, coupon_code) {
    try {
        await couponEngine.release({ redemption_id, requesting_user_id: user_id });
    } catch (err) {
        logger.warn({ err, order_id, coupon_code, redemption_id }, 'applyAutoCoupons: release also failed — leaving orphan reservation');
    }
}

module.exports = { applyAutoCoupons };
