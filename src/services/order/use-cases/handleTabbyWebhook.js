'use strict';

const axios = require('axios');
const PendingPayment = require('../../../repositories').pendingPayments.rawModel();
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');
const { processPendingPayment } = require('../adapters/pendingPayment');

module.exports = async function handleTabbyWebhook(payload) {
    logger.info("🚀 [Tabby Webhook] Webhook endpoint hit");
    const { clientIP, secret, data } = payload;

    const allowedIPs = process.env.TABBY_IPS.split(',');

    logger.debug({ clientIP }, "🌍 Client IP");
    if (!allowedIPs.includes(clientIP)) {
        logger.info("❌ Returning 403: Forbidden IP");
        throw { status: 403, message: 'Forbidden IP' };
    }

    logger.debug({ expectedSecret: process.env.TABBY_WEBHOOK_SECRET }, "🔑 Expected secret");
    logger.debug({ receivedSecret: secret }, "📬 Received secret");
    if (secret !== process.env.TABBY_WEBHOOK_SECRET) {
        logger.info("❌ Returning 401: Unauthorized (Invalid Secret)");
        throw { status: 401, message: 'Unauthorized' };
    }

    const { id: paymentId } = data;
    if (!paymentId) {
        logger.info("⚠️ Returning 400: paymentId missing");
        throw { status: 400, message: 'paymentId missing' };
    }

    logger.debug({ paymentId }, "💳 Payment ID");

    const paymentResp = await axios.get(`https://api.tabby.ai/api/v2/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}` }
    });

    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();
    logger.debug({ status }, "📊 Payment status");

    if (status === 'AUTHORIZED') {
        logger.info("💰 Payment authorized — attempting capture...");
        const captureResp = await axios.post(
            `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
            { amount: payment.amount },
            { headers: { 'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}` } }
        );

        if (captureResp.data.status?.toUpperCase() !== 'CLOSED') {
            logger.info("❌ Returning 500: Capture failed");
            throw { status: 500, message: 'Capture failed' };
        }
    }

    const finalStatus = status === 'AUTHORIZED' ? 'CLOSED' : status;
    const pkTime = clock.now().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
    logger.debug({ pkTime }, '🕒 Time');
    logger.debug({ finalStatus }, "✅ Final Status");

    if (finalStatus === 'CLOSED') {
        logger.info("🎉 Payment successful, checking for pending payments...");

        const pendingPayment = await PendingPayment.findOne({
            payment_id: paymentId,
            status: 'pending'
        });

        if (pendingPayment) {
            logger.info("📋 [Webhook] Found pending payment, processing order creation...");
            await processPendingPayment(paymentId, payment);
        } else {
            logger.info("📋 [Webhook] No pending payment found, payment was processed normally");
        }

        return { message: 'Order processed' };
    } else if (status === 'CREATED') {
        logger.info("🎉 ================================================");
        logger.info("🎉 ========== PAYMENT PROCEEDED SUCCESSFULLY ==========");
        logger.info("🎉 ================================================");
        logger.info(`🎉 Payment ID: ${paymentId}`);
        logger.info(`🎉 Status: ${status}`);
        logger.info("🎉 ================================================");

        const pendingPayment = await PendingPayment.findOne({
            payment_id: paymentId,
            status: 'pending'
        });

        if (pendingPayment) {
            logger.info("📋 [Webhook] Found pending payment, processing order creation...");
            await processPendingPayment(paymentId, payment);
        } else {
            logger.info("📋 [Webhook] No pending payment found for CREATED status");
        }

        return { message: 'Order processed' };
    }

    logger.info("📥 Returning 200: Webhook received");
    return { message: 'Webhook received' };
};
