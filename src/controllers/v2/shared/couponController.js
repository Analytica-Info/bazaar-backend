'use strict';

/**
 * v2 Coupon controller — shared (mobile + web).
 *
 * Wraps couponService without modifying the underlying service layer.
 * Anonymous callers are supported on both endpoints (auth.optional()).
 */

const { wrap, wrapError } = require('../_shared/responseEnvelope');
const couponService = require('../../../services/couponService');
const logger = require('../../../utilities/logger');

/**
 * GET /v2/coupons
 * Returns coupon-availability metadata.
 *
 * Note: the underlying v1 service is misnamed — it returns a count, not a list.
 * v2 surfaces this honestly as `{ count }` so future client code reads correctly.
 */
async function getCoupons(req, res) {
  try {
    const result = await couponService.getCoupons();
    const count = typeof result?.count === 'number' ? result.count : 0;
    return res.status(200).json(wrap({ count }, 'Coupons fetched successfully'));
  } catch (err) {
    logger.error({ err }, 'v2 getCoupons: unhandled error');
    const status = err.status || 500;
    return res.status(status).json(wrapError('COUPONS_FETCH_FAILED', err.message || 'Failed to fetch coupons'));
  }
}

/**
 * POST /v2/coupons/validate
 * Validates a coupon or promo code for the caller.
 *
 * Body: { couponCode: string, ...optional context }
 */
async function validateCoupon(req, res) {
  try {
    const { couponCode, ...rest } = req.body || {};
    const userId = req.user?._id || null;

    if (!couponCode) {
      return res.status(400).json(wrapError('VALIDATION_ERROR', 'couponCode is required'));
    }

    const result = await couponService.checkCouponCode(couponCode, userId, rest);

    // Normalise service result into the v2 data envelope.
    // The service already returns { success, message, type, discountPercent, capAED, ... }
    // We surface all fields under data so clients can read them uniformly.
    const { success: _svcSuccess, message: svcMessage, ...payload } = result;
    return res.status(200).json(wrap({ valid: true, ...payload }, svcMessage));
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json(wrapError('COUPON_INVALID', err.message));
    }
    logger.error({ err }, 'v2 validateCoupon: unhandled error');
    return res.status(500).json(wrapError('COUPON_VALIDATION_FAILED', err.message || 'Failed to validate coupon'));
  }
}

module.exports = { getCoupons, validateCoupon };
