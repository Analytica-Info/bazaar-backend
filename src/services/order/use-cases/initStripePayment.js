'use strict';

const stripe = require("stripe")(process.env.STRIPE_SK);
const User = require('../../../repositories').users.rawModel();
const { STRIPE_AMOUNT_MULTIPLIER } = require('../../../config/constants/money');

module.exports = async function initStripePayment(userId, amountAED) {
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

    return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerId,
        ephemeralKey: ephemeralKey.secret,
    };
};
