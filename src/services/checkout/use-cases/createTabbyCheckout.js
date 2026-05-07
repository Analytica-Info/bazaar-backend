'use strict';

/**
 * use-cases/createTabbyCheckout.js
 *
 * Extracted from checkoutService (PR-MOD-4).
 */

const repositories = require('../../../repositories');
const CartData = repositories.cartData.rawModel();

const logger = require('../../../utilities/logger');
const { resolveCheckoutDiscountAED } = require('../domain/discountResolver');

/**
 * @param {Array} cartData
 * @param {string} userId
 * @param {object} metadata
 * @returns {Promise<{ checkout_url: string, status: string }>}
 */
async function createTabbyCheckout(cartData, userId, metadata) {
  try {
    const { customerOrderData, orderData, paymentMethod } = metadata;
    const { payment, merchant_urls, merchant_code, lang } = customerOrderData;

    const {
      cartData: tabbyCartData, shippingCost, name, phone, address, currency,
      city, area, buildingName, floorNo, apartmentNo, landmark,
      discountPercent, couponCode, mobileNumber, saved_total,
      bankPromoId, discountAmount, capAED,
    } = orderData;

    const { discountAED: tabbyDisc, subtotalBefore: subtotalAmount } =
      await resolveCheckoutDiscountAED({
        cartData: tabbyCartData, bankPromoId, discountPercent, discountAmount, capAED,
      });

    const tabbyTotalAED = Math.round((subtotalAmount - tabbyDisc + Number(shippingCost || 0)) * 100) / 100;
    payment.amount = String(tabbyTotalAED);
    if (!payment.order) payment.order = {};
    payment.order.discount_amount = tabbyDisc.toFixed(2);
    payment.order.shipping_amount = String(shippingCost || 0);

    const cartDataEntry = await CartData.create({ cartData: tabbyCartData });
    const cartDataId = cartDataEntry._id;

    payment.meta = {
      ...(payment.meta || {}),
      name: String(name), phone: String(phone), address: String(address),
      city: String(city || ''), area: String(area || ''),
      buildingName: String(buildingName || ''),
      floorNo: String(floorNo || ''), apartmentNo: String(apartmentNo || ''),
      landmark: String(landmark || ''),
      subtotalAmount: String(subtotalAmount),
      shippingCost: String(shippingCost || 0), currency: String(currency),
      cartDataId: String(cartDataId),
      couponCode: String(couponCode || ''), mobileNumber: String(mobileNumber || ''),
      paymentMethod: String(paymentMethod),
      discountPercent: String(discountPercent || 0),
      saved_total: String(saved_total || 0),
      bankPromoId: String(bankPromoId || ''),
    };

    const requestBody = {
      payment: {
        amount: String(payment.amount),
        currency: String(payment.currency).toUpperCase(),
        description: String(payment.description),
        buyer: {
          name: String(payment.buyer.name), phone: String(payment.buyer.phone),
          email: String(payment.buyer.email), dob: String(payment.buyer.dob || ''),
        },
        shipping_address: {
          city: String(payment.shipping_address.city),
          address: String(payment.shipping_address.address),
          zip: String(payment.shipping_address.zip || ''),
        },
        order: {
          tax_amount: String(payment.order.tax_amount),
          shipping_amount: String(payment.order.shipping_amount),
          discount_amount: String(payment.order.discount_amount),
          saved_total: String(payment.order.saved_total),
          updated_at: payment.order.updated_at,
          reference_id: String(payment.order.reference_id),
          items: payment.order.items.map((item) => ({
            title: String(item.title), description: String(item.description || ''),
            quantity: Number(item.quantity), unit_price: String(item.unit_price),
            discount_amount: String(item.discount_amount || '0.00'),
            reference_id: String(item.reference_id), image_url: String(item.image_url),
            product_url: String(item.product_url),
            category: String(item.category || 'general'),
            brand: String(item.brand || 'Your Store Brand'),
            is_refundable: Boolean(item.is_refundable !== false),
            gender: String(item.gender || 'Unisex'), color: String(item.color || ''),
            product_material: String(item.product_material || ''),
            size_type: String(item.size_type || ''), size: String(item.size || ''),
          })),
        },
        buyer_history: {
          registered_since: payment.buyer_history.registered_since,
          loyalty_level: Number(payment.buyer_history.loyalty_level || 0),
          wishlist_count: Number(payment.buyer_history.wishlist_count || 0),
          is_social_networks_connected: Boolean(payment.buyer_history.is_social_networks_connected),
          is_phone_number_verified: Boolean(payment.buyer_history.is_phone_number_verified),
          is_email_verified: Boolean(payment.buyer_history.is_email_verified),
        },
        order_history: payment.order_history || [],
        meta: payment.meta,
      },
      lang: String(lang || 'en'),
      merchant_code: String(merchant_code),
      merchant_urls: {
        success: String(merchant_urls.success),
        cancel: String(merchant_urls.cancel),
        failure: String(merchant_urls.failure),
      },
    };

    const tabbyResponse = await fetch('https://api.tabby.ai/api/v2/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await tabbyResponse.json();

    if (tabbyResponse.ok) {
      if (data.status === 'rejected') {
        const rejectionReason = data.message || data.reason ||
          'Sorry, Tabby is unable to approve this purchase. Please use an alternative payment method for your order.';
        throw { status: 400, message: rejectionReason, data: { status: 'rejected' } };
      }

      const installments = data?.configuration?.available_products?.installments || [];
      const checkout_url = installments.length > 0 ? installments[0]?.web_url : null;

      if (checkout_url && data.status === 'created') {
        return { checkout_url, status: data.status };
      } else {
        throw { status: 500, message: 'No available products in Tabby configuration' };
      }
    } else {
      console.error('Tabby API Error:', { status: tabbyResponse.status, data, sentPayload: requestBody });
      throw { status: tabbyResponse.status, message: data.message || 'Failed to create Tabby checkout' };
    }
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Tabby checkout error:');
    throw { status: 500, message: 'Internal server error' };
  }
}

module.exports = createTabbyCheckout;
