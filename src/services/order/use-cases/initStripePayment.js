'use strict';

const stripe = require("stripe")(process.env.STRIPE_SK);
const User = require('../../../repositories').users.rawModel();
const PendingPayment = require('../../../repositories').pendingPayments.rawModel();
const { STRIPE_AMOUNT_MULTIPLIER } = require('../../../config/constants/money');
const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

module.exports = async function initStripePayment(userId, amountAED, orderData) {
    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found' };

    let customerId = user.customerId;

    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            description: 'Bazaar UAE customer',
        });
        customerId = customer.id;
        user.customerId = customerId;
        await user.save();
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: '2023-10-16' }
    );

    const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amountAED * STRIPE_AMOUNT_MULTIPLIER),
        currency: 'aed',
        customer: customerId,
        setup_future_usage: 'off_session',
        payment_method_types: ['card'],
    });

    if (orderData == null) {
        logger.warn(
            { userId, paymentIntentId: paymentIntent.id },
            '[initStripePayment] called without orderData; PendingPayment skipped — webhook recovery disabled for this payment'
        );
    } else {
        const _now = clock.now();
        const formatDate = _now.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai',
        });
        const formatTime = _now.toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai',
        });
        const orderTime = `${formatDate}, ${formatTime}`;

        await PendingPayment.create({
            user_id: userId,
            payment_id: paymentIntent.id,
            payment_method: 'stripe',
            order_data: orderData,
            status: 'pending',
            orderfrom: 'Mobile App',
            orderTime,
        });
    }

    return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerId,
        ephemeralKey: ephemeralKey.secret,
    };
};
