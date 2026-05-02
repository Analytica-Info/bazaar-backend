'use strict';

/**
 * business.js — domain/business-rule constants.
 *
 * These are product-specific values that rarely change but are
 * semantically important.  They are kept as code constants rather
 * than env vars because they represent invariants of the domain
 * model (gift eligibility threshold, minimum gift stock, delivery
 * window) and a code change + deploy is the right gate for changing
 * them.
 *
 * Exception: DELIVERY_DAYS is exposed via runtime config so ops can
 * tune it without a deploy if logistics conditions change.
 */

/**
 * Default minimum cart subtotal (AED) for gift eligibility when
 * the Product document has no giftThreshold set.
 * @see src/services/cart/domain/giftProduct.js
 */
const GIFT_THRESHOLD_DEFAULT_AED = 400;

/**
 * Minimum in-stock units for the gift product to be considered
 * available for automatic addition to the cart.
 */
const GIFT_MIN_STOCK = 5;

/**
 * Number of calendar days from order placement to estimated delivery.
 * Used to compute the `formattedDeliveryDate` shown in order-confirmation
 * emails.  Mirror of DELIVERY_DAYS in runtime config — prefer the
 * runtime value when you need env-override capability.
 */
const DELIVERY_DAYS = 3;

/**
 * Maximum number of recovery-code resend attempts within the sliding
 * 24-hour window (auth lockout policy).
 */
const MAX_RECOVERY_ATTEMPTS = 5;

module.exports = {
  GIFT_THRESHOLD_DEFAULT_AED,
  GIFT_MIN_STOCK,
  DELIVERY_DAYS,
  MAX_RECOVERY_ATTEMPTS,
};
