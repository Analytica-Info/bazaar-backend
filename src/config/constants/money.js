'use strict';

/**
 * money.js — currency and payment constants.
 *
 * STRIPE_AMOUNT_MULTIPLIER: Stripe expects amounts in the smallest
 *   currency unit (fils/cents).  AED has 100 fils per dirham.
 *
 * AED_DECIMAL_PLACES: used with toFixed() for display formatting.
 *
 * DEFAULT_CURRENCY: ISO 4217 code for the storefront's default
 *   checkout currency.
 */

/** Multiply AED amounts by this before passing to Stripe/Nomod. */
const STRIPE_AMOUNT_MULTIPLIER = 100;

/** Decimal places to preserve when rounding AED amounts for display. */
const AED_DECIMAL_PLACES = 2;

/** Default ISO 4217 currency code for checkout flows. */
const DEFAULT_CURRENCY = 'AED';

/** Percentage base — used in discount-percent calculations (pct / 100). */
const PERCENT_BASE = 100;

module.exports = {
  STRIPE_AMOUNT_MULTIPLIER,
  AED_DECIMAL_PLACES,
  DEFAULT_CURRENCY,
  PERCENT_BASE,
};
