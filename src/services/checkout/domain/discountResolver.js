'use strict';

/**
 * domain/discountResolver.js
 *
 * Pure-function discount helpers extracted from checkoutService (PR-MOD-4).
 * resolveCheckoutDiscountAED performs one async DB read (BankPromoCode).
 */

const repositories = require('../../../repositories');
const BankPromoCode = repositories.bankPromoCodes.rawModel();

const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Compute the AED discount from a percentage + optional cap.
 * @param {number} subtotal
 * @param {number|string} discountPercent
 * @param {number|string|null} capAED
 * @returns {number}
 */
function computeCartDiscountAED(subtotal, discountPercent, capAED) {
  const pct = Number(discountPercent) || 0;
  if (pct <= 0) return 0;
  const s = Number(subtotal);
  let byPercent = (s * pct) / 100;
  if (capAED != null && capAED !== '' && Number(capAED) > 0) {
    byPercent = Math.min(byPercent, Number(capAED));
  }
  return Math.round(byPercent * 100) / 100;
}

/**
 * Sum up the cart subtotal from cartData items.
 * @param {Array<{price: number|string, qty: number|string}>} cartData
 * @returns {number}
 */
function cartSubtotalFromCartData(cartData) {
  return cartData.reduce(
    (s, item) => s + Number(item.price) * Number(item.qty),
    0
  );
}

/**
 * Resolve the discount AED and subtotal for a checkout session.
 * Priority: bankPromoId > discountPercent > discountAmount (flat).
 *
 * @param {{
 *   cartData: Array,
 *   bankPromoId?: string,
 *   discountPercent?: number|string,
 *   discountAmount?: number|string,
 *   capAED?: number|string
 * }} opts
 * @returns {Promise<{ discountAED: number, subtotalBefore: number }>}
 */
async function resolveCheckoutDiscountAED({
  cartData,
  bankPromoId,
  discountPercent,
  discountAmount,
  capAED,
}) {
  const subtotalBefore = cartSubtotalFromCartData(cartData);

  if (bankPromoId) {
    try {
      const promo = await BankPromoCode.findById(bankPromoId).lean();
      if (promo && promo.active && new Date(promo.expiryDate) >= clock.now()) {
        return {
          discountAED: computeCartDiscountAED(
            subtotalBefore,
            promo.discountPercent,
            promo.capAED
          ),
          subtotalBefore,
        };
      }
    } catch (e) {
      logger.error({ err: e }, 'resolveCheckoutDiscountAED bankPromoId');
    }
  }

  const pct = Number(discountPercent) || 0;
  if (pct > 0) {
    return {
      discountAED: computeCartDiscountAED(subtotalBefore, pct, capAED),
      subtotalBefore,
    };
  }

  return {
    discountAED: Math.max(0, Number(discountAmount) || 0),
    subtotalBefore,
  };
}

module.exports = {
  computeCartDiscountAED,
  cartSubtotalFromCartData,
  resolveCheckoutDiscountAED,
};
