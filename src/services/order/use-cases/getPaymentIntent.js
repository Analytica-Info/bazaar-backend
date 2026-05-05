'use strict';

const axios = require('axios');
const API_KEY = process.env.STRIPE_SK;

module.exports = async function getPaymentIntent() {
    const paymentIntentId = 'pi_3RVUm3Ga9aBXxV9x0vKrp7qq';
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
