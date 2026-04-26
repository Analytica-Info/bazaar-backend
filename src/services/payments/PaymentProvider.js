/**
 * Payment Provider Interface
 *
 * All payment providers must implement these methods.
 * This is the contract that makes providers swappable.
 *
 * Usage:
 *   const provider = PaymentProviderFactory.create('stripe');
 *   const session = await provider.createCheckout({ amount, currency, items, ... });
 *   const status = await provider.getCheckout(session.id);
 *   const refund = await provider.refund(session.id, { amount, reason });
 */

class PaymentProvider {
    constructor(name) {
        this.name = name;
    }

    /**
     * Create a hosted checkout session.
     *
     * @param {Object} params
     * @param {string} params.referenceId   — Internal order/cart reference
     * @param {number} params.amount        — Total payable amount after discounts
     * @param {string} params.currency      — ISO 4217 (e.g. "AED")
     * @param {number} [params.discount]    — Discount amount (default 0)
     * @param {Array}  params.items         — [{name, quantity, price}]
     * @param {number} [params.shippingCost] — Shipping cost
     * @param {Object} [params.customer]    — {name, email, phone}
     * @param {string} params.successUrl    — Redirect on success
     * @param {string} params.failureUrl    — Redirect on failure
     * @param {string} params.cancelledUrl  — Redirect on cancel
     * @param {Object} [params.metadata]    — Arbitrary key-value pairs
     *
     * @returns {Promise<{id: string, redirectUrl: string, raw: Object}>}
     *   - id: provider's session/checkout ID
     *   - redirectUrl: URL to redirect the user to (null if not applicable)
     *   - raw: full provider response for storage
     */
    async createCheckout(params) {
        throw new Error(`${this.name}: createCheckout() not implemented`);
    }

    /**
     * Get checkout/payment status.
     *
     * @param {string} sessionId — The provider's session/checkout ID
     * @returns {Promise<{id: string, status: string, paid: boolean, amount: number, currency: string, raw: Object}>}
     *   - status: normalized status ("paid", "pending", "cancelled", "expired", "failed")
     *   - paid: boolean shortcut
     *   - raw: full provider response
     */
    async getCheckout(sessionId) {
        throw new Error(`${this.name}: getCheckout() not implemented`);
    }

    /**
     * Refund a payment.
     *
     * @param {string} sessionId — The provider's session/checkout ID
     * @param {Object} params
     * @param {number} params.amount  — Refund amount
     * @param {string} [params.reason] — Reason for refund
     * @param {string} [params.referenceId] — Internal refund reference
     * @returns {Promise<{refundId: string, status: string, amount: number, raw: Object}>}
     *   - status: "pending", "completed", "failed"
     */
    async refund(sessionId, params) {
        throw new Error(`${this.name}: refund() not implemented`);
    }

    /**
     * Cancel/delete a checkout session (if supported).
     *
     * @param {string} sessionId
     * @returns {Promise<void>}
     */
    async cancelCheckout(sessionId) {
        throw new Error(`${this.name}: cancelCheckout() not implemented`);
    }

    /**
     * Handle webhook/callback from the provider.
     *
     * @param {Object} payload — Raw webhook body
     * @param {Object} headers — Request headers (for signature verification)
     * @returns {Promise<{event: string, sessionId: string, status: string, raw: Object}>}
     *   - event: normalized event type ("payment.success", "payment.failed", "refund.completed")
     */
    async handleWebhook(payload, headers) {
        throw new Error(`${this.name}: handleWebhook() not implemented`);
    }
}

module.exports = PaymentProvider;
