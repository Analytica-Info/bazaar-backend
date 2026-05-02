'use strict';

/**
 * use-cases/createStripeCheckout.js
 *
 * Extracted from checkoutService (PR-MOD-4).
 * BUG-010: stripe + env consts captured at module load time.
 */

const stripe = require('stripe')(process.env.STRIPE_SK);

const repositories = require('../../../repositories');
const CartData = repositories.cartData.rawModel();

const logger = require('../../../utilities/logger');
const { resolveCheckoutDiscountAED } = require('../domain/discountResolver');

/**
 * Create a Stripe checkout session.
 *
 * @param {Array} cartData
 * @param {string} userId
 * @param {object} metadata
 * @returns {Promise<{ id: string }>}
 */
async function createStripeCheckout(cartData, userId, metadata) {
  const {
    shippingCost, name, phone, address, currency, city, area,
    buildingName, floorNo, apartmentNo, landmark, discountPercent,
    couponCode, mobileNumber, paymentMethod, discountAmount,
    totalAmount, subTotalAmount, saved_total, bankPromoId, capAED,
  } = metadata;

  const cartDataEntry = await CartData.create({ cartData: cartData });
  const cartDataId = cartDataEntry._id;

  const { discountAED: disc, subtotalBefore } = await resolveCheckoutDiscountAED({
    cartData, bankPromoId, discountPercent, discountAmount, capAED,
  });
  const subtotalAfter = Math.max(0, subtotalBefore - disc);
  const totalBeforeCents = Math.round(subtotalBefore * 100);
  const totalAfterCents = Math.round(subtotalAfter * 100);

  let lineItems;
  if (disc > 0 && subtotalBefore > 0 && totalBeforeCents > 0) {
    let allocatedCents = 0;
    lineItems = cartData.map((item, index) => {
      const lineBeforeCents = Math.round(Number(item.price) * 100) * Number(item.qty);
      let lineAfterCents;
      if (index === cartData.length - 1) {
        lineAfterCents = totalAfterCents - allocatedCents;
      } else {
        lineAfterCents = Math.round(totalAfterCents * (lineBeforeCents / totalBeforeCents));
        allocatedCents += lineAfterCents;
      }
      const qty = Number(item.qty) || 1;
      const unitCents = Math.max(1, Math.round(lineAfterCents / qty));
      return {
        price_data: {
          currency: currency,
          product_data: { name: item.name, description: item.variant || '' },
          unit_amount: unitCents,
        },
        quantity: qty,
      };
    });
  } else {
    lineItems = cartData.map((item) => ({
      price_data: {
        currency: currency,
        product_data: { name: item.name, description: item.variant || '' },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: Number(item.qty),
    }));
  }

  try {
    if (shippingCost) {
      lineItems.push({
        price_data: {
          currency: currency,
          product_data: { name: 'Shipping Cost' },
          unit_amount: Math.round(Number(shippingCost) * 100),
        },
        quantity: 1,
      });
    }

    let sessionOptions = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${process.env.URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/failed`,
      metadata: {
        name, phone, address,
        city: city || '', area: area || '',
        buildingName: buildingName || '',
        floorNo: String(floorNo ?? ''),
        apartmentNo: String(apartmentNo ?? ''),
        landmark: landmark || '',
        totalAmount, subTotalAmount, saved_total,
        shippingCost, currency,
        cartDataId: cartDataId.toString(),
        couponCode: couponCode || '',
        mobileNumber: mobileNumber || '',
        paymentMethod, discountAmount,
        bankPromoId: bankPromoId || '',
      },
    };

    const session = await stripe.checkout.sessions.create(sessionOptions);
    return { id: session.id };
  } catch (error) {
    logger.error({ err: error }, 'Error creating checkout session:');
    throw { status: 500, message: 'Internal Server Error' };
  }
}

module.exports = createStripeCheckout;
