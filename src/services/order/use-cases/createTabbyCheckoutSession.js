'use strict';

const PendingPayment = require('../../../repositories').pendingPayments.rawModel();
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

module.exports = async function createTabbyCheckoutSession(userId, bodyData, metadata) {
    const {
        cartData,
        shippingCost,
        name,
        phone,
        address,
        state,
        city,
        area,
        floorNo,
        buildingName,
        apartmentNo,
        landmark,
        currency,
        discountPercent,
        discountAmount,
        couponCode,
        payment_method,
        mobileNumber,
        paymentIntentId,
        txnId,
        paymentStatus,
        user_email,
        total,
        sub_total,
    } = bodyData;
    const user_id = userId;
    const fcmToken = metadata?.fcmToken || null;

    await logBackendActivity({
        platform: 'Mobile App Backend',
        activity_name: 'Checkout Session Tabby API Hit',
        status: 'success',
        message: `Tabby checkoutSessionTabby API hit - user: ${user_id || 'n/a'}, email: ${user_email || 'n/a'}, payment_method: ${payment_method || 'n/a'}. Order data: cartData, shippingCost, name, phone, address, state, city, area, floorNo, buildingName, apartmentNo, landmark, currency, discountPercent, discountAmount, couponCode, mobileNumber, user_email, total, sub_total, txnId, paymentStatus, fcmToken`,
        execution_path: 'orderController.checkoutSessionTabby (initial)'
    });

    if (payment_method !== 'tabby') {
        throw { status: 400, message: 'This endpoint is only for Tabby payments' };
    }

    if (!paymentIntentId) {
        throw { status: 400, message: 'paymentIntentId is required' };
    }

    logger.debug({ paymentIntentId }, "💾 [Tabby] Storing order data for payment");

    const _now = clock.now();
    const formatDate = _now.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Dubai",
    });

    const formatTime = _now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Dubai",
    });

    const orderTime = `${formatDate}, ${formatTime}`;

    // Store order data in PendingPayment for webhook processing
    const pendingPayment = new PendingPayment({
        user_id: user_id,
        payment_id: paymentIntentId,
        payment_method: 'tabby',
        order_data: {
            cartData,
            shippingCost,
            name,
            phone,
            address,
            state,
            city,
            area,
            floorNo,
            buildingName,
            apartmentNo,
            landmark,
            currency,
            discountPercent,
            discountAmount,
            couponCode,
            mobileNumber,
            user_email,
            total,
            sub_total,
            txnId,
            paymentStatus,
            fcmToken
        },
        status: 'pending',
        orderfrom: 'Mobile App',
        orderTime: orderTime
    });

    await pendingPayment.save();

    logger.info("✅ [Tabby] Order data stored successfully, ready for payment");

    return {
        message: "Order data stored successfully",
        paymentId: paymentIntentId,
        status: "ready_for_payment"
    };
};
