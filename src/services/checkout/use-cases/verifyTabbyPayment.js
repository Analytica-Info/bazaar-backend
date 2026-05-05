'use strict';

/**
 * use-cases/verifyTabbyPayment.js
 *
 * Checkout-side Tabby payment verification + order creation.
 * Extracted from checkoutService (PR-MOD-4).
 *
 * NOTE: This is the checkout variant. Do NOT confuse with
 * src/services/order/use-cases/verifyTabbyPayment.js (order-side).
 */

const axios = require('axios');

const repositories = require('../../../repositories');
const BankPromoCode = repositories.bankPromoCodes.rawModel();
const BankPromoCodeUsage = repositories.bankPromoCodeUsages.rawModel();
const Notification = repositories.notifications.rawModel();

const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');
const createOrderAndSendEmails = require('./createOrderAndSendEmails');
const { MS_PER_DAY } = require('../../../config/constants/time');
const runtimeConfig = require('../../../config/runtime');

const DELIVERY_DAYS = runtimeConfig.order.deliveryDays;

/**
 * @param {string} paymentId
 * @param {string} userId
 * @param {string} [bankPromoId]
 * @returns {Promise<{ message: string, orderId: string }>}
 */
async function verifyTabbyPayment(paymentId, userId, bankPromoId) {
  try {
    if (!paymentId) {
      throw { status: 400, message: 'paymentId is required' };
    }

    const paymentResp = await axios.get(
      `https://api.tabby.ai/api/v2/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` } }
    );
    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();

    if (status === 'AUTHORIZED') {
      const captureResp = await axios.post(
        `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
        { amount: payment.amount },
        { headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` } }
      );
      if (captureResp.data.status?.toUpperCase() !== 'CLOSED') {
        throw { status: 500, message: 'Capture failed' };
      }
    }

    const finalStatus = status === 'AUTHORIZED' ? 'CLOSED' : status;
    if (finalStatus === 'CLOSED') {
      const order = await createOrderAndSendEmails(payment, userId);

      if (bankPromoId && userId) {
        try {
          const promo = await BankPromoCode.findById(bankPromoId);
          if (promo) {
            const existing = await BankPromoCodeUsage.findOne({
              bankPromoCodeId: promo._id, userId: userId,
            });
            if (!existing) {
              await BankPromoCodeUsage.create({ bankPromoCodeId: promo._id, userId: userId });
              promo.usageCount = (promo.usageCount || 0) + 1;
              await promo.save();
              logger.info(`Bank promo ${promo.code} usage recorded for user ${userId} (Tabby).`);
            }
          }
        } catch (err) {
          logger.error({ err: err }, 'Error recording bank promo usage (Tabby):');
        }
      }

      const currentDate = clock.now();
      const deliveryDate = new Date(currentDate.getTime() + DELIVERY_DAYS * MS_PER_DAY);
      const dayNum = deliveryDate.getDate();
      const dayOfWeek = deliveryDate.toLocaleString('default', { weekday: 'long' });
      const monthStr = deliveryDate.toLocaleString('default', { month: 'long' });
      const formattedDeliveryDate = `${dayOfWeek}, ${dayNum} ${monthStr}`;

      const orderName = order.name;
      const totalAmount = parseFloat(order.amount_total.replace(/,/g, ''));

      await Notification.create({
        userId: userId,
        title: `Order No: ${order.order_id} Placed Successfully`,
        message: `Hi ${orderName}, your order of AED ${totalAmount.toFixed(2)} is confirmed. Expected by ${formattedDeliveryDate}. Thank you for shopping with Bazaar!`,
      });

      return { message: 'Order created successfully', orderId: order._id };
    }

    throw { status: 400, message: `Payment status is ${status}` };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Tabby Payment error:');
    throw { status: 500, message: 'Internal server error' };
  }
}

module.exports = verifyTabbyPayment;
