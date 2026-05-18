const axios = require('axios');
const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');
const logger = require('../../utilities/logger');
const runtimeConfig = require('../../config/runtime');

const NOMOD_BASE_URL = 'https://api.nomod.com';

/** Exponential backoff delays in ms for 429 retries (1 s, 2 s, 4 s). */
const BACKOFF_DELAYS_MS = [1000, 2000, 4000];

/** Maximum number of total attempts (initial + retries). */
const MAX_ATTEMPTS = 3;

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
            timeout: runtimeConfig.external.nomodTimeoutMs,
        });
    }

    // ─── Retry infrastructure ────────────────────────────────────────────────

    /**
     * Compute the delay in ms for the nth retry attempt (0-indexed).
     * Honours `Retry-After` header when present (value in seconds).
     *
     * @param {number} attemptIndex  — 0 = first retry, 1 = second, ...
     * @param {Object} [responseHeaders] — headers from the 429 response
     * @returns {number} delay in milliseconds
     */
    _getRetryDelayMs(attemptIndex, responseHeaders = {}) {
        const retryAfter = responseHeaders['retry-after'];
        if (retryAfter != null) {
            const seconds = Number(retryAfter);
            if (!Number.isNaN(seconds) && seconds > 0) {
                return seconds * 1000;
            }
        }
        return BACKOFF_DELAYS_MS[attemptIndex] || BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];
    }

    /**
     * Promisified sleep — separated so tests can spy and avoid real delays.
     *
     * @param {number} ms
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Execute an axios call with 429-only retry logic.
     *
     * Only 429 (Too Many Requests) is retried. All other errors (4xx, 5xx) are
     * thrown immediately to avoid double-processing side effects.
     *
     * @param {() => Promise} fn  — zero-argument function that calls this.client.*
     * @param {string} [paymentId] — for structured log context
     * @returns {Promise} resolved axios response
     */
    async _withRetry(fn, paymentId) {
        let lastError;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
                return await fn();
            } catch (error) {
                const status = error?.response?.status;
                if (status !== 429) {
                    // Non-429 errors are fatal — do not retry
                    throw error;
                }
                lastError = error;
                if (attempt < MAX_ATTEMPTS - 1) {
                    const delayMs = this._getRetryDelayMs(attempt, error?.response?.headers || {});
                    logger.warn(
                        { attempt: attempt + 1, delayMs, paymentId },
                        'Nomod 429 — backing off before retry',
                    );
                    await this._sleep(delayMs);
                }
            }
        }
        // Exhausted all attempts
        throw {
            status: 429,
            message: `Rate limited by Nomod after ${MAX_ATTEMPTS} retries`,
        };
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    async createCheckout({
        referenceId, amount, currency = 'AED', discount = 0,
        items, shippingCost = 0, customer, successUrl, failureUrl, cancelledUrl, metadata = {},
    }) {
        if (!this.apiKey) throw { status: 500, message: 'Nomod API key not configured' };

        // Nomod rejects items[].name longer than 100 chars (validation error
        // "Ensure this field has no more than 100 characters."). Truncate
        // defensively — long Lightspeed product names hit this regularly.
        // Same 100-char cap is applied to reference_id below.
        const lineItems = items.map((item, idx) => ({
            item_id: String(item.id || item.variantId || `item-${idx + 1}`),
            name: String(item.name || 'Product').slice(0, 100),
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

        // Nomod collects customer details on their hosted checkout page.
        // Sending partial customer data causes validation errors, so we omit it.
        // NOTE: if the customer block is re-enabled, normalise phone via toE164 first.
        // See src/utilities/phone.js → toE164(customer.phone).

        try {
            logger.info({ body: JSON.stringify(body) }, 'Nomod createCheckout request body');
            const res = await this._withRetry(() => this.client.post('/v1/checkout', body), referenceId);
            logger.info({ checkoutId: res.data.id, referenceId }, 'Nomod checkout created');
            return { id: res.data.id, redirectUrl: res.data.url, raw: res.data };
        } catch (error) {
            // Surface Nomod's full response body to the caller so the mobile
            // app can show an actionable error instead of the opaque
            // "Request failed with status code 400". Falls back to the
            // generic message if the response body is empty.
            const data = error.response?.data;
            const msg =
                data?.message ||
                data?.detail ||
                data?.error ||
                (Array.isArray(data?.errors)
                    ? data.errors
                        .map((e) => e.message || e.detail || JSON.stringify(e))
                        .join('; ')
                    : null) ||
                (data ? JSON.stringify(data) : null) ||
                error.message ||
                'Failed to create Nomod checkout';
            logger.error(
                { err: data, referenceId, status: error.response?.status },
                'Nomod createCheckout failed',
            );
            throw {
                status: error.response?.status || error.status || 500,
                message: msg,
            };
        }
    }

    async getCheckout(sessionId) {
        if (!this.apiKey) throw { status: 500, message: 'Nomod API key not configured' };

        try {
            const res = await this._withRetry(() => this.client.get(`/v1/checkout/${sessionId}`), sessionId);
            const data = res.data;
            return {
                id: data.id,
                status: data.status, // paid, created, cancelled, expired
                paid: data.status === 'paid',
                amount: data.amount,
                currency: data.currency,
                reference_id: data.reference_id,
                charges: Array.isArray(data.charges)
                    ? data.charges.map((c) => ({
                        id: c.id,
                        amount: c.amount,
                        paymentTime: c.payment_time,
                        paymentMethod: c.payment_method,
                        status: c.status,
                    }))
                    : [],
                raw: data,
            };
        } catch (error) {
            if (error.status === 429) throw error; // already structured by _withRetry
            if (error.response?.status === 404) throw { status: 404, message: 'Checkout not found' };
            throw { status: error.response?.status || 500, message: 'Failed to retrieve checkout' };
        }
    }

    /**
     * Refund a checkout session (checkout-level refund).
     *
     * @deprecated Prefer {@link refundCharge} for granular charge-level refunds.
     *   This method is kept for backward compatibility only.
     */
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
            const res = await this._withRetry(
                () => this.client.post(`/v1/checkout/${sessionId}/refund`, body),
                sessionId,
            );
            logger.info({ sessionId, refundId: res.data.refund_id, amount }, 'Nomod refund created');
            return {
                refundId: res.data.refund_id,
                status: res.data.status, // pending, completed, failed
                amount: res.data.amount,
                raw: res.data,
            };
        } catch (error) {
            if (error.status === 429) throw error;
            const msg = error.response?.data?.message || 'Failed to create refund';
            throw { status: error.response?.status || 500, message: msg };
        }
    }

    /**
     * Refund a specific charge by its charge ID.
     *
     * This is the preferred refund path. It targets the actual money-movement
     * object rather than the checkout session wrapper, making it more granular
     * and auditable. Use this for all new refund logic.
     *
     * @param {string} chargeId  — Nomod charge UUID (from checkout.charges[].id)
     * @param {Object} params
     * @param {string} params.amount  — Amount to refund as a decimal string (e.g. "50.00")
     * @returns {Promise<{ message: string }>}
     */
    async refundCharge(chargeId, { amount } = {}) {
        if (!this.apiKey) throw { status: 500, message: 'Nomod API key not configured' };
        if (!chargeId) throw { status: 400, message: 'chargeId required' };
        if (!amount) throw { status: 400, message: 'Refund amount is required' };

        const body = { amount: String(amount) };

        try {
            const res = await this._withRetry(
                () => this.client.post(`/v1/charges/${chargeId}/refund`, body),
                chargeId,
            );
            logger.info({ chargeId, amount }, 'Nomod charge refund created');
            return { message: res.data.message };
        } catch (error) {
            if (error.status === 429) throw error;
            const code = error.response?.data?.code || '';
            const baseMsg = error.response?.data?.message || 'Failed to refund charge';
            const msg = code ? `${baseMsg} [${code}]` : baseMsg;
            throw { status: error.response?.status || 500, message: msg };
        }
    }

    async cancelCheckout(sessionId) {
        if (!this.apiKey) throw { status: 500, message: 'Nomod API key not configured' };

        try {
            await this._withRetry(() => this.client.delete(`/v1/checkout/${sessionId}/delete`), sessionId);
            logger.info({ sessionId }, 'Nomod checkout cancelled');
        } catch (error) {
            if (error.status === 429) throw error;
            if (error.response?.status === 404) throw { status: 404, message: 'Checkout not found' };
            throw { status: error.response?.status || 500, message: 'Failed to cancel checkout' };
        }
    }

    /**
     * Implements the Recoverable port: query the terminal state of a checkout session.
     *
     * Maps Nomod's checkout status to a provider-agnostic RecoveryResult so the
     * polling reconciler doesn't need to know about Nomod internals.
     *
     * Mapping rules:
     *   checkout.status === 'paid'
     *     AND totalCharged >= checkout.amount → { terminalState: 'paid' }
     *     AND totalCharged <  checkout.amount → { terminalState: 'pending', reason: 'partial_settlement' }
     *   checkout.status === 'cancelled'       → { terminalState: 'cancelled' }
     *   checkout.status === 'expired'         → { terminalState: 'expired' }
     *   checkout.status === 'created'         → { terminalState: 'pending' }
     *   404 from Nomod                        → { terminalState: 'expired' }  (session gone)
     *   any other error                       → { terminalState: 'unknown', reason: error.message }
     *
     * @param {string} paymentId - Nomod checkout session ID
     * @returns {Promise<import('./ports/recoverable').RecoveryResult>}
     */
    async queryPaymentState(paymentId) {
        let checkout;
        try {
            checkout = await this.getCheckout(paymentId);
        } catch (error) {
            if (error.status === 404) {
                return { terminalState: 'expired', reason: 'checkout_not_found' };
            }
            return { terminalState: 'unknown', reason: error.message || 'provider_error' };
        }

        const status = checkout.status;
        const raw = checkout.raw;

        if (status === 'paid') {
            const expectedAmount = Number(checkout.amount) || 0;
            const totalCharged = (checkout.charges || [])
                .filter((c) => c.status === 'paid' || c.status === 'authorised')
                .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

            if (expectedAmount > 0 && totalCharged < expectedAmount) {
                return {
                    terminalState: 'pending',
                    reason: 'partial_settlement',
                    raw,
                };
            }
            return { terminalState: 'paid', raw };
        }

        if (status === 'cancelled') {
            return { terminalState: 'cancelled', raw };
        }

        if (status === 'expired') {
            return { terminalState: 'expired', raw };
        }

        // 'created' or any unrecognised active status — still in progress
        return { terminalState: 'pending', raw };
    }

    async handleWebhook(payload, headers) {
        // Nomod uses redirect-based flow, not webhooks
        // If they add webhooks in the future, implement signature verification here
        logger.warn('Nomod webhook handler called — Nomod uses redirect flow, not webhooks');
        return { event: 'unknown', sessionId: null, status: null, raw: payload };
    }
}

module.exports = NomodProvider;
