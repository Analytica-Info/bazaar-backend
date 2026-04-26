const axios = require('axios');
const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');
const logger = require('../../utilities/logger');

const NOMOD_BASE_URL = 'https://api.nomod.com';

class NomodProvider extends PaymentProvider {
    constructor() {
        super('nomod');
        this.apiKey = process.env.NOMOD_API_KEY;
        this.client = axios.create({
            baseURL: NOMOD_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-KEY': this.apiKey,
            },
            timeout: 30000,
        });
    }

    async createCheckout({
        referenceId, amount, currency = 'AED', discount = 0,
        items, shippingCost = 0, customer, successUrl, failureUrl, cancelledUrl, metadata = {},
    }) {
        if (!this.apiKey) throw { status: 500, message: 'Nomod API key not configured' };

        const lineItems = items.map((item, idx) => ({
            item_id: String(item.id || item.variantId || `item-${idx + 1}`),
            name: item.name || 'Product',
            quantity: Number(item.quantity) || 1,
            unit_amount: String(Number(item.price).toFixed(2)),
        }));

        if (shippingCost > 0) {
            lineItems.push({ item_id: 'shipping', name: 'Shipping', quantity: 1, unit_amount: String(Number(shippingCost).toFixed(2)) });
        }

        const body = {
            reference_id: String(referenceId).substring(0, 100),
            amount: String(Number(amount).toFixed(2)),
            currency: currency.toUpperCase(),
            discount: String(Number(discount).toFixed(2)),
            items: lineItems,
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
            logger.info({ body: JSON.stringify(body) }, 'Nomod createCheckout request body');
            const res = await this.client.post('/v1/checkout', body);
            logger.info({ checkoutId: res.data.id, referenceId }, 'Nomod checkout created');
            return { id: res.data.id, redirectUrl: res.data.url, raw: res.data };
        } catch (error) {
            const msg = error.response?.data?.message || error.response?.data?.detail || 'Failed to create Nomod checkout';
            logger.error({ err: error.response?.data, referenceId, status: error.response?.status }, 'Nomod createCheckout failed');
            throw { status: error.response?.status || 500, message: msg };
        }
    }

    async getCheckout(sessionId) {
        if (!this.apiKey) throw { status: 500, message: 'Nomod API key not configured' };

        try {
            const res = await this.client.get(`/v1/checkout/${sessionId}`);
            const data = res.data;
            return {
                id: data.id,
                status: data.status, // paid, created, cancelled, expired
                paid: data.status === 'paid',
                amount: data.amount,
                currency: data.currency,
                raw: data,
            };
        } catch (error) {
            if (error.response?.status === 404) throw { status: 404, message: 'Checkout not found' };
            throw { status: error.response?.status || 500, message: 'Failed to retrieve checkout' };
        }
    }

    async refund(sessionId, { amount, reason, referenceId } = {}) {
        if (!this.apiKey) throw { status: 500, message: 'Nomod API key not configured' };
        if (!amount) throw { status: 400, message: 'Refund amount is required' };

        const body = {
            amount: String(Number(amount).toFixed(2)),
            idempotency_key: crypto.randomUUID(),
        };
        if (reason) body.reason = reason;
        if (referenceId) body.reference_id = referenceId;

        try {
            const res = await this.client.post(`/v1/checkout/${sessionId}/refund`, body);
            logger.info({ sessionId, refundId: res.data.refund_id, amount }, 'Nomod refund created');
            return {
                refundId: res.data.refund_id,
                status: res.data.status, // pending, completed, failed
                amount: res.data.amount,
                raw: res.data,
            };
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to create refund';
            throw { status: error.response?.status || 500, message: msg };
        }
    }

    async cancelCheckout(sessionId) {
        if (!this.apiKey) throw { status: 500, message: 'Nomod API key not configured' };

        try {
            await this.client.delete(`/v1/checkout/${sessionId}/delete`);
            logger.info({ sessionId }, 'Nomod checkout cancelled');
        } catch (error) {
            if (error.response?.status === 404) throw { status: 404, message: 'Checkout not found' };
            throw { status: error.response?.status || 500, message: 'Failed to cancel checkout' };
        }
    }

    async handleWebhook(payload, headers) {
        // Nomod uses redirect-based flow, not webhooks
        // If they add webhooks in the future, implement signature verification here
        logger.warn('Nomod webhook handler called — Nomod uses redirect flow, not webhooks');
        return { event: 'unknown', sessionId: null, status: null, raw: payload };
    }
}

module.exports = NomodProvider;
