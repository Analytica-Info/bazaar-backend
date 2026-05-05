'use strict';

/**
 * use-cases/handleTabbyWebhook.js
 *
 * Tabby webhook handler. Extracted from checkoutService (PR-MOD-4).
 */

const axios = require('axios');
const logger = require('../../../utilities/logger');
const createOrderAndSendEmails = require('./createOrderAndSendEmails');

/**
 * @param {Buffer|object} payload
 * @param {string} userId
 * @param {string} clientIP
 * @param {string} webhookSecret
 * @returns {Promise<{ message: string }>}
 */
async function handleTabbyWebhook(payload, userId, clientIP, webhookSecret) {
  try {
    const allowedIPs = process.env.TABBY_IPS.split(',');
    if (!allowedIPs.includes(clientIP)) {
      throw { status: 403, message: 'Forbidden IP' };
    }

    if (webhookSecret !== process.env.TABBY_WEBHOOK_SECRET) {
      throw { status: 401, message: 'Unauthorized' };
    }

    let data;
    if (Buffer.isBuffer(payload)) {
      data = JSON.parse(payload.toString('utf-8'));
    } else if (typeof payload === 'object') {
      data = payload;
    } else {
      throw new Error('Unexpected payload type');
    }

    const { id: paymentId } = data;
    if (!paymentId) throw { status: 400, message: 'paymentId missing' };

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
      await createOrderAndSendEmails(payment, userId);
      return { message: 'Order processed' };
    }

    return { message: 'Webhook received' };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, 'Tabby webhook error:');
    throw { status: 500, message: 'Internal server error' };
  }
}

module.exports = handleTabbyWebhook;
