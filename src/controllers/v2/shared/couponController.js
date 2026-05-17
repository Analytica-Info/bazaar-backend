'use strict';

/**
 * v2 Coupon controller — shared (mobile + web).
 *
 * Exposes the coupon availability endpoint (getCoupons) and the
 * v2 engine endpoints (validate, apply, release, redeem, eligible).
 */

const { wrap, wrapError } = require('../_shared/responseEnvelope');
const couponService = require('../../../services/couponService');
const couponEngine = require('../../../services/coupon');
const { serializeReward } = require('../../../services/coupon/wire/serializeReward');
const logger = require('../../../utilities/logger');

/**
 * GET /v2/coupons/issuance-count
 * Returns coupon-availability metadata (issuance count).
 */
async function getIssuanceCount(req, res) {
  try {
    const result = await couponService.getCoupons();
    const count = typeof result?.count === 'number' ? result.count : 0;
    return res.status(200).json(wrap({ count }, 'Coupons fetched successfully'));
  } catch (err) {
    logger.error({ err }, 'v2 getIssuanceCount: unhandled error');
    const status = err.status || 500;
    return res.status(status).json(wrapError('COUPONS_FETCH_FAILED', err.message || 'Failed to fetch coupons'));
  }
}

/**
 * POST /v2/coupons/validate
 * Body: { code, phone, cart_snapshot, locale }
 * Returns structured v2 verdict.
 */
async function validate(req, res) {
  try {
    // Destructure only known keys — do NOT spread unknown body fields into ctx.
    const { code, phone, cart_snapshot, locale } = req.body || {};
    const user_id = req.user?._id?.toString() || null;

    if (!code) {
      return res.status(400).json(wrapError('VALIDATION_ERROR', 'code is required'));
    }

    const { verdict, discount, coupon } = await couponEngine.validate({
      code,
      phone,
      user_id,
      cart: cart_snapshot || {},
      ctx: { locale, platform: req.platform },
    });

    if (!verdict.eligible) {
      return res.status(200).json(
        wrap({ valid: false, reason: verdict.reason, message: verdict.message, recoverable: verdict.recoverable })
      );
    }

    return res.status(200).json(
      wrap({
        valid: true,
        discount_aed: discount.aed,
        reward: serializeReward(discount),
        code: coupon.code,
      })
    );
  } catch (err) {
    logger.error({ err }, 'validate: unhandled error');
    return res.status(500).json(wrapError('COUPON_VALIDATION_FAILED', err.message || 'Failed to validate coupon'));
  }
}

/**
 * POST /v2/coupons/apply
 * Body: { code, phone, cart_snapshot, idempotency_key }
 */
async function apply(req, res) {
  try {
    // Destructure only known keys — do NOT spread unknown body fields into ctx.
    const { code, phone, cart_snapshot, locale, idempotency_key } = req.body || {};
    const user_id = req.user?._id?.toString() || null;

    if (!code || !phone) {
      return res.status(400).json(wrapError('VALIDATION_ERROR', 'code and phone are required'));
    }

    const result = await couponEngine.apply({
      code,
      phone,
      user_id,
      cart: cart_snapshot || {},
      ctx: { locale, platform: req.platform },
      idempotency_key,
    });

    if (result.error) {
      return res.status(200).json(
        wrap({ success: false, reason: result.error.reason, message: result.error.message })
      );
    }

    return res.status(200).json(wrap({ success: true, ...result }));
  } catch (err) {
    logger.error({ err }, 'apply: unhandled error');
    return res.status(500).json(wrapError('COUPON_APPLY_FAILED', err.message || 'Failed to apply coupon'));
  }
}

/**
 * POST /v2/coupons/release
 * Body: { redemption_id }
 */
async function release(req, res) {
  try {
    const { redemption_id } = req.body || {};
    if (!redemption_id) {
      return res.status(400).json(wrapError('VALIDATION_ERROR', 'redemption_id is required'));
    }

    const requesting_user_id = req.user._id.toString();
    const result = await couponEngine.release({ redemption_id, requesting_user_id });

    if (!result.success) {
      const status = result.status || 400;
      const code = result.code || 'RELEASE_FAILED';
      return res.status(status).json(wrapError(code, result.error || 'Failed to release coupon'));
    }

    return res.status(200).json(wrap({ success: true, already_released: result.already_released || false }));
  } catch (err) {
    logger.error({ err }, 'release: unhandled error');
    return res.status(500).json(wrapError('COUPON_RELEASE_FAILED', err.message || 'Failed to release coupon'));
  }
}

/**
 * POST /v2/coupons/redeem
 * Body: { redemption_id, order_id, final_cart }
 *
 * Requires auth. Re-validates the discount against final_cart before confirming.
 * Returns { success, redemption } or { code: 'CART_CHANGED', error } on stale cart.
 */
async function redeem(req, res) {
  try {
    const { redemption_id, order_id, final_cart } = req.body || {};

    if (!redemption_id) {
      return res.status(400).json(wrapError('VALIDATION_ERROR', 'redemption_id is required'));
    }
    if (!final_cart) {
      return res.status(400).json(wrapError('VALIDATION_ERROR', 'final_cart is required'));
    }

    const result = await couponEngine.redeemV2({ redemption_id, order_id, final_cart });

    if (!result.success) {
      if (result.code === 'CART_CHANGED') {
        return res.status(409).json(wrapError('CART_CHANGED', result.error));
      }
      return res.status(400).json(wrapError('REDEEM_FAILED', result.error || 'Failed to redeem coupon'));
    }

    return res.status(200).json(wrap({ success: true, redemption: result.redemption }));
  } catch (err) {
    logger.error({ err }, 'redeem: unhandled error');
    return res.status(500).json(wrapError('COUPON_REDEEM_FAILED', err.message || 'Failed to redeem coupon'));
  }
}

/**
 * GET /v2/coupons/eligible?phone=&subtotal=&vertical=
 */
async function eligible(req, res) {
  try {
    const { phone, subtotal, vertical, user_id: queryUserId } = req.query;
    const user_id = req.user?._id?.toString() || queryUserId || null;

    const cart = {
      subtotal: subtotal ? Number(subtotal) : 0,
      vertical: vertical || '',
    };

    const results = await couponEngine.eligible({ phone, user_id, cart, ctx: { vertical, platform: req.platform } });

    return res.status(200).json(wrap({ coupons: results }));
  } catch (err) {
    logger.error({ err }, 'eligible: unhandled error');
    return res.status(500).json(wrapError('ELIGIBLE_FETCH_FAILED', err.message || 'Failed to fetch eligible coupons'));
  }
}

// Keep getCoupons as alias for backward-compat within test imports during migration.
const getCoupons = getIssuanceCount;

module.exports = { getIssuanceCount, getCoupons, validate, apply, release, redeem, eligible };
