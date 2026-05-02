'use strict';

/**
 * use-cases/createNomodCheckout.js
 *
 * Nomod checkout session creation (website flow).
 * Extracted from checkoutService (PR-MOD-4).
 */

const repositories = require('../../../repositories');
const CartData = repositories.cartData.rawModel();
const PendingPayment = repositories.pendingPayments.rawModel();

const PaymentProviderFactory = require('../../payments/PaymentProviderFactory');
const { resolveCheckoutDiscountAED } = require('../domain/discountResolver');
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

/**
 * @param {object} req - Express request object
 * @returns {Promise<{ status: string, checkout_url: string, checkout_id: string }>}
 */
async function createNomodCheckout(req) {
  try {
    const userId = req.user?._id;
    const {
      cartData, shippingCost = 0, name, phone, address, currency = 'AED',
      city, area, buildingName, floorNo, apartmentNo, landmark,
      discountPercent, couponCode, mobileNumber, saved_total,
      bankPromoId, discountAmount, capAED, successUrl, failureUrl, cancelledUrl,
    } = req.body;

    if (!cartData || !cartData.length) {
      throw { status: 400, message: 'cartData is required' };
    }

    const { discountAED, subtotalBefore: subtotalAmount } = await resolveCheckoutDiscountAED({
      cartData, bankPromoId, discountPercent, discountAmount, capAED,
    });

    const totalAmount = Math.round((subtotalAmount - discountAED + Number(shippingCost || 0)) * 100) / 100;

    const cartDataEntry = await CartData.create({ cartData });
    const cartDataId = cartDataEntry._id;

    const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || process.env.URL || 'https://bazaar-uae.com';

    const provider = PaymentProviderFactory.create('nomod');
    const checkout = await provider.createCheckout({
      referenceId: `${userId}-${clock.nowMs()}`,
      amount: totalAmount,
      currency,
      discount: discountAED,
      items: cartData.map(item => ({
        id: item.variantId || item.id || item.product_id,
        name: item.name || 'Product',
        quantity: item.qty || 1,
        price: item.price,
      })),
      shippingCost: Number(shippingCost || 0),
      customer: { name, phone },
      successUrl: successUrl || `${FRONTEND_BASE_URL}/success`,
      failureUrl: failureUrl || `${FRONTEND_BASE_URL}/failed`,
      cancelledUrl: cancelledUrl || `${FRONTEND_BASE_URL}/cancelled`,
      metadata: {
        userId: String(userId), cartDataId: String(cartDataId),
        name: String(name || ''), phone: String(phone || ''),
        address: String(address || ''), city: String(city || ''),
        area: String(area || ''), buildingName: String(buildingName || ''),
        floorNo: String(floorNo || ''), apartmentNo: String(apartmentNo || ''),
        landmark: String(landmark || ''), currency: String(currency),
        shippingCost: String(shippingCost || 0),
        subtotalAmount: String(subtotalAmount),
        totalAmount: String(totalAmount),
        discountAmount: String(discountAED),
        couponCode: String(couponCode || ''),
        mobileNumber: String(mobileNumber || ''),
        saved_total: String(saved_total || 0),
        bankPromoId: String(bankPromoId || ''),
      },
    });

    const formatDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
    const formatTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' });
    const orderTime = `${formatDate} - ${formatTime}`;

    await PendingPayment.create({
      user_id: userId,
      payment_id: checkout.id,
      payment_method: 'nomod',
      order_data: {
        cartData, shippingCost, name, phone, address, city, area,
        buildingName, floorNo, apartmentNo, landmark, currency,
        discountPercent, discountAmount: discountAED, couponCode,
        mobileNumber, saved_total, bankPromoId,
        subtotalAmount, totalAmount, cartDataId: String(cartDataId),
      },
      status: 'pending',
      orderfrom: 'Website',
      orderTime,
    });

    logger.info({ checkoutId: checkout.id, userId }, 'Nomod checkout created (website)');
    return { status: 'created', checkout_url: checkout.redirectUrl, checkout_id: checkout.id };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Nomod createCheckout error:');
    throw { status: 500, message: 'Internal server error' };
  }
}

module.exports = createNomodCheckout;
