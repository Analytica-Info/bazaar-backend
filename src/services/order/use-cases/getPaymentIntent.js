'use strict';

// Admin/debug use only — not wired into any mobile flow.
// Callers must supply a real paymentIntentId; no default is provided.
const axios = require('axios');
const API_KEY = process.env.STRIPE_SK;

module.exports = async function getPaymentIntent(paymentIntentId) {
    if (!paymentIntentId) {
        throw { status: 400, message: 'paymentIntentId is required' };
    }

    const response = await axios.get(
        `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                Accept: 'application/json',
            },
        }
    );

    return response.data;
};
