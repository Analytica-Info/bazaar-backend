'use strict';

const PendingPayment = require('../../../repositories').pendingPayments.rawModel();
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

module.exports = async function createNomodCheckoutSession(userId, bodyData, metadata) {
    const {
        cartData, shippingCost, name, phone, address, state, city, area,
        floorNo, buildingName, apartmentNo, landmark, currency,
        discountPercent, discountAmount, couponCode, payment_method,
        mobileNumber, paymentIntentId, txnId, paymentStatus, user_email,
        total, sub_total,
    } = bodyData;
    const fcmToken = metadata?.fcmToken || null;

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Checkout Session Nomod API Hit',
        status: 'success',
        message: `Nomod checkoutSessionNomod API hit - user: ${userId || 'n/a'}, email: ${user_email || 'n/a'}`,
        execution_path: 'orderController.checkoutSessionNomod (initial)'
    });

    if (payment_method !== 'nomod') {
        throw { status: 400, message: 'This endpoint is only for Nomod payments' };
    }

    if (!paymentIntentId) {
        throw { status: 400, message: 'paymentIntentId is required' };
    }

    const _now = clock.now();
    const formatDate = _now.toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai",
    });
    const formatTime = _now.toLocaleTimeString("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Dubai",
    });
    const orderTime = `${formatDate}, ${formatTime}`;

    const pendingPayment = new PendingPayment({
        user_id: userId,
        payment_id: paymentIntentId,
        payment_method: 'nomod',
        order_data: {
            cartData, shippingCost, name, phone, address, state, city, area,
            floorNo, buildingName, apartmentNo, landmark, currency,
            discountPercent, discountAmount, couponCode, mobileNumber,
            user_email, total, sub_total, txnId, paymentStatus, fcmToken,
        },
        status: 'pending',
        orderfrom: 'Mobile App',
        orderTime,
    });

    await pendingPayment.save();
    logger.info({ paymentIntentId, userId }, '[Nomod] Order data stored, ready for payment');

    return { message: 'Order data stored successfully', paymentId: paymentIntentId, status: 'ready_for_payment' };
};
