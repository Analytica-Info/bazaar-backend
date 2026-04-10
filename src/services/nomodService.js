/**
 * Nomod Payment Service
 *
 * Hosted Checkout integration with Nomod payment gateway.
 * API Reference: https://nomod.com/docs/api-reference/introduction
 *
 * Base URL: https://api.nomod.com
 * Auth: X-API-KEY header
 *
 * Endpoints:
 *   POST   /v1/checkout              — Create checkout session
 *   GET    /v1/checkout/:id          — Retrieve checkout details
 *   DELETE /v1/checkout/:id/delete   — Archive (cancel) checkout
 *   POST   /v1/checkout/:id/refund   — Refund a charge
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utilities/logger');

const NOMOD_BASE_URL = 'https://api.nomod.com';
const NOMOD_API_KEY = process.env.NOMOD_API_KEY;

const nomodClient = axios.create({
    baseURL: NOMOD_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-KEY': NOMOD_API_KEY,
    },
    timeout: 30000,
});

// Log requests in development
nomodClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const data = error.response?.data;
        logger.error({
            status: error.response?.status,
            data,
            url: error.config?.url,
            method: error.config?.method,
        }, 'Nomod API error');
        throw error;
    }
);

/**
 * Create a Nomod Hosted Checkout session.
 *
 * @param {Object} params
 * @param {string} params.referenceId  — Unique reference (e.g. order ID, cart ID). Max 100 chars.
 * @param {number} params.amount       — Total payable amount after discounts (e.g. 139.00)
 * @param {string} params.currency     — ISO 4217 currency code (e.g. "AED")
 * @param {number} [params.discount]   — Discount amount applied (default 0.00)
 * @param {Array}  params.items        — Line items [{name, quantity, amount}]
 * @param {Object} [params.customer]   — Customer info {name, email, phone}
 * @param {string} params.successUrl   — Redirect URL on payment success
 * @param {string} params.failureUrl   — Redirect URL on payment failure
 * @param {string} params.cancelledUrl — Redirect URL on payment cancellation
 * @param {Object} [params.metadata]   — Arbitrary key-value pairs
 *
 * @returns {Object} { id, url, status, amount, currency, referenceId, createdAt, items, customer, metadata, charges }
 */
exports.createCheckout = async ({
    referenceId,
    amount,
    currency = 'AED',
    discount = 0,
    items,
    customer,
    successUrl,
    failureUrl,
    cancelledUrl,
    metadata = {},
}) => {
    if (!NOMOD_API_KEY) {
        throw { status: 500, message: 'Nomod API key not configured' };
    }

    if (!referenceId || !amount || !items || !successUrl || !failureUrl || !cancelledUrl) {
        throw { status: 400, message: 'Missing required fields for Nomod checkout' };
    }

    const body = {
        reference_id: String(referenceId).substring(0, 100),
        amount: String(Number(amount).toFixed(2)),
        currency: currency.toUpperCase(),
        discount: String(Number(discount).toFixed(2)),
        items: items.map(item => ({
            name: item.name || 'Product',
            quantity: Number(item.quantity) || 1,
            amount: String(Number(item.amount || item.price).toFixed(2)),
        })),
        success_url: successUrl,
        failure_url: failureUrl,
        cancelled_url: cancelledUrl,
        metadata,
    };

    if (customer) {
        body.customer = {};
        if (customer.name) body.customer.name = customer.name;
        if (customer.email) body.customer.email = customer.email;
        if (customer.phone) body.customer.phone = customer.phone;
    }

    try {
        const response = await nomodClient.post('/v1/checkout', body);
        logger.info({ checkoutId: response.data.id, referenceId }, 'Nomod checkout created');
        return response.data;
    } catch (error) {
        const msg = error.response?.data?.message || error.response?.data?.detail || 'Failed to create Nomod checkout';
        const status = error.response?.status || 500;
        throw { status, message: msg, nomodError: error.response?.data };
    }
};

/**
 * Retrieve a Nomod checkout session by ID.
 *
 * @param {string} checkoutId — The checkout session UUID
 * @returns {Object} { id, url, status, amount, discount, currency, reference_id, created_at, items, customer, metadata, charges }
 *
 * Status values: "paid", "created", "cancelled", "expired"
 */
exports.getCheckout = async (checkoutId) => {
    if (!NOMOD_API_KEY) {
        throw { status: 500, message: 'Nomod API key not configured' };
    }

    try {
        const response = await nomodClient.get(`/v1/checkout/${checkoutId}`);
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            throw { status: 404, message: 'Nomod checkout not found' };
        }
        throw { status: error.response?.status || 500, message: 'Failed to retrieve Nomod checkout' };
    }
};

/**
 * Delete (archive) a Nomod checkout session.
 *
 * @param {string} checkoutId — The checkout session UUID
 * @returns {void}
 */
exports.deleteCheckout = async (checkoutId) => {
    if (!NOMOD_API_KEY) {
        throw { status: 500, message: 'Nomod API key not configured' };
    }

    try {
        await nomodClient.delete(`/v1/checkout/${checkoutId}/delete`);
        logger.info({ checkoutId }, 'Nomod checkout deleted');
    } catch (error) {
        if (error.response?.status === 404) {
            throw { status: 404, message: 'Nomod checkout not found' };
        }
        throw { status: error.response?.status || 500, message: 'Failed to delete Nomod checkout' };
    }
};

/**
 * Create a refund for a Nomod checkout charge.
 *
 * @param {string} checkoutId         — The checkout session UUID
 * @param {Object} params
 * @param {number} params.amount      — Refund amount (must be <= original charge amount)
 * @param {string} [params.reason]    — Reason for refund
 * @param {string} [params.referenceId] — Unique reference for the refund
 * @param {Object} [params.metadata]  — Arbitrary key-value pairs
 *
 * @returns {Object} { refund_id, charge_id, status, amount, currency, refund_time, reason, reference_id, metadata }
 *
 * Refund status values: "pending", "completed", "failed"
 */
exports.createRefund = async (checkoutId, { amount, reason, referenceId, metadata = {} } = {}) => {
    if (!NOMOD_API_KEY) {
        throw { status: 500, message: 'Nomod API key not configured' };
    }

    if (!amount) {
        throw { status: 400, message: 'Refund amount is required' };
    }

    const idempotencyKey = crypto.randomUUID();

    const body = {
        amount: String(Number(amount).toFixed(2)),
        idempotency_key: idempotencyKey,
    };

    if (reason) body.reason = reason;
    if (referenceId) body.reference_id = referenceId;
    if (metadata && Object.keys(metadata).length > 0) body.metadata = metadata;

    try {
        const response = await nomodClient.post(`/v1/checkout/${checkoutId}/refund`, body);
        logger.info({ checkoutId, refundId: response.data.refund_id, amount }, 'Nomod refund created');
        return response.data;
    } catch (error) {
        const status = error.response?.status || 500;
        const data = error.response?.data;

        if (status === 422) {
            throw { status: 422, message: data?.message || 'Refund validation failed', nomodError: data };
        }
        if (status === 404) {
            throw { status: 404, message: 'Nomod checkout not found' };
        }

        throw { status, message: data?.message || 'Failed to create Nomod refund', nomodError: data };
    }
};

/**
 * Helper: Build checkout params from Bazaar order data.
 * Maps our internal order structure to Nomod's API format.
 *
 * @param {Object} orderData — Bazaar order data from checkout
 * @param {string} userId    — User ID for reference
 * @returns {Object} params ready for createCheckout()
 */
exports.buildCheckoutFromOrder = (orderData, userId) => {
    const {
        cartData,
        shippingCost = 0,
        name,
        phone,
        city,
        area,
        totalAmount,
        subTotalAmount,
        discountAmount = 0,
        couponCode,
    } = orderData;

    const items = cartData.map(item => ({
        name: item.name || 'Product',
        quantity: Number(item.qty) || 1,
        amount: String(Number(item.price).toFixed(2)),
    }));

    // Add shipping as a line item if > 0
    if (shippingCost > 0) {
        items.push({
            name: 'Shipping',
            quantity: 1,
            amount: String(Number(shippingCost).toFixed(2)),
        });
    }

    const frontendUrl = process.env.URL || process.env.FRONTEND_BASE_URL || 'http://localhost:5173';

    return {
        referenceId: `order-${userId}-${Date.now()}`,
        amount: Number(totalAmount || subTotalAmount).toFixed(2),
        currency: 'AED',
        discount: Number(discountAmount).toFixed(2),
        items,
        customer: {
            name: name || undefined,
            phone: phone || undefined,
        },
        successUrl: `${frontendUrl}/success?provider=nomod&checkout_id={CHECKOUT_SESSION_ID}`,
        failureUrl: `${frontendUrl}/failed?provider=nomod`,
        cancelledUrl: `${frontendUrl}/cancelled?provider=nomod`,
        metadata: {
            user_id: String(userId),
            coupon_code: couponCode || '',
            city: city || '',
            area: area || '',
            shipping_cost: String(shippingCost),
        },
    };
};
