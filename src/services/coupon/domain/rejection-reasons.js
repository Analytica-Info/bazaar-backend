'use strict';

/**
 * Structured rejection reason codes for the v2 coupon engine.
 * These are the canonical codes used throughout the engine.
 * The v1 adapter maps these to legacy message strings.
 *
 * @readonly
 * @enum {string}
 */
const REASONS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  EXPIRED: 'EXPIRED',
  NOT_STARTED: 'NOT_STARTED',
  ALREADY_USED: 'ALREADY_USED',
  BELOW_MINIMUM: 'BELOW_MINIMUM',
  FIRST_ORDER_ONLY: 'FIRST_ORDER_ONLY',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  DISABLED: 'DISABLED',
  RATE_LIMITED: 'RATE_LIMITED',
  GLOBAL_CAP_REACHED: 'GLOBAL_CAP_REACHED',
  USER_CAP_REACHED: 'USER_CAP_REACHED',
  PLATFORM_NOT_ELIGIBLE: 'PLATFORM_NOT_ELIGIBLE',
  /** Gift product is out of stock (or below the configured min_buffer). */
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  /**
   * Returned when a public caller (e.g. /validate, /apply) attempts to use a
   * coupon whose trigger is not 'code'. Auto-triggered coupons must be issued
   * via evaluateAuto or grant — they cannot be entered as promo codes.
   */
  COUPON_LOCKED_AUTO: 'COUPON_LOCKED_AUTO',
});

module.exports = REASONS;
