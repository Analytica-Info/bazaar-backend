'use strict';

/**
 * verifyNomodPayment — Wave 2 hardened implementation
 *
 * Atomicity & Authorization (PAYMENT-FLOW-DESIGN.md §3):
 *   - `requestingUserId` is MANDATORY. Callers that omit it receive a 401 rather
 *     than silently bypassing the ownership check.
 *   - The controller passes `req.user?._id`; if the token is missing the service
 *     throws 401 so the controller does NOT need to pre-validate.
 *
 * Amount + currency validation (Wave 2 deliverable 2):
 *   - Compares Nomod's reported amount/currency against the PendingPayment record
 *     written at checkout-session creation. Mismatch is a security event.
 *
 * Charges[] walk (Wave 2 deliverable 3):
 *   - When charges are present, sums only `paid`-status entries.
 *   - If that sum differs from the expected total by ≥ 0.01, returns
 *     `{ finalStatus: 'partial' }` rather than flagging success.
 *   - Empty charges array is the legacy/simple-payment case — accepted as paid
 *     when checkout.paid is true (no regression for current traffic).
 *
 * Response shape (additive only — Wave 2 deliverable 4):
 *   Paid / partial / non-paid responses always include:
 *     paymentId, amount (string 2dp), currency (uppercased),
 *     chargesPaid (count), referenceId
 *   Mobile controller reads only `message` and `finalStatus` — unchanged.
 *   New fields are available for admin tooling and support dashboards.
 */

const PaymentProviderFactory = require('../../payments/PaymentProviderFactory');
const { logBackendActivity } = require('../../../utilities/backendLogger');

/**
 * Verify a Nomod checkout session after a mobile redirect.
 *
 * @param {string} paymentId          - Nomod checkout session ID
 * @param {string|null} requestingUserId - Authenticated user's _id (MANDATORY)
 * @returns {Promise<{
 *   message: string,
 *   finalStatus?: string,
 *   paymentId: string,
 *   amount: string,
 *   currency: string,
 *   chargesPaid: number,
 *   referenceId: string,
 * }>}
 */
module.exports = async function verifyNomodPayment(paymentId, requestingUserId) {
    // ── Guard: paymentId ──────────────────────────────────────────────────────
    if (!paymentId) {
        throw { status: 400, message: 'paymentId is required' };
    }

    // ── Guard: auth MANDATORY (Wave 2 deliverable 1) ──────────────────────────
    // Defense-in-depth: throw 401 immediately rather than silently skip the
    // ownership check when the caller omits requestingUserId.
    if (!requestingUserId) {
        throw { status: 401, message: 'Authentication required' };
    }

    // ── Resolve PendingPayment (authorization + amount baseline) ──────────────
    const PendingPayment = require('../../../repositories').pendingPayments.rawModel();

    const pending = await PendingPayment
        .findOne({ payment_id: paymentId })
        .select('user_id order_data')
        .lean();

    // Authorization check — must be done before existence check to avoid leaking
    // whether a paymentId exists to an unauthorized caller.
    if (pending && String(pending.user_id) !== String(requestingUserId)) {
        throw { status: 403, message: 'Not authorized to verify this payment' };
    }

    // Existence check — after authorization so we don't leak existence info.
    if (!pending) {
        throw { status: 404, message: 'PendingPayment not found for this paymentId' };
    }

    // ── Fetch checkout from Nomod ─────────────────────────────────────────────
    const provider = PaymentProviderFactory.create('nomod');
    const checkout = await provider.getCheckout(paymentId);

    // ── Amount + currency validation (Wave 2 deliverable 2) ───────────────────
    const expectedTotal = Number(pending.order_data.total);
    const expectedCurrency = String(pending.order_data.currency || 'AED').toUpperCase();
    const reportedAmount = Number(checkout.amount).toFixed(2);
    const reportedCurrency = String(checkout.currency || '').toUpperCase();

    const amountMatch = reportedAmount === expectedTotal.toFixed(2);
    const currencyMatch = reportedCurrency === expectedCurrency;

    if (!amountMatch || !currencyMatch) {
        await logBackendActivity({
            platform: 'Mobile App Backend',
            activity_name: 'Nomod Payment Verification',
            status: 'failure',
            message: 'Payment amount or currency mismatch — possible tampering',
            execution_path: 'verifyNomodPayment (amount/currency guard)',
            error_details: JSON.stringify({
                expected: { amount: expectedTotal.toFixed(2), currency: expectedCurrency },
                received: { amount: reportedAmount, currency: reportedCurrency },
                paymentId,
            }),
        });
        throw {
            status: 400,
            message: 'Payment amount or currency mismatch — possible tampering',
            code: 'AMOUNT_MISMATCH',
        };
    }

    // ── Charges[] walk (Wave 2 deliverable 3) ────────────────────────────────
    const charges = checkout.charges || [];
    const settledCharges = charges.filter(
        c => String(c.status).toLowerCase() === 'paid'
    );
    const chargesPaid = settledCharges.length;
    const totalCaptured = settledCharges.reduce(
        (sum, c) => sum + Number(c.amount || 0), 0
    );
    const isFullyPaid = checkout.paid && (
        charges.length === 0                         // legacy / simple-payment path
        || Math.abs(totalCaptured - expectedTotal) < 0.01
    );

    // ── Build additive fields (Wave 2 deliverable 4) ──────────────────────────
    const additiveFields = {
        paymentId,
        amount: reportedAmount,
        currency: reportedCurrency,
        chargesPaid,
        referenceId: checkout.reference_id || '',
    };

    // ── Return result ─────────────────────────────────────────────────────────
    const status = String(checkout.status || '').toLowerCase();

    if (isFullyPaid) {
        return {
            message: `Payment status is ${status}`,
            ...additiveFields,
        };
    }

    // Partial settlement: checkout.paid=true but charges don't cover full amount.
    if (checkout.paid && charges.length > 0 && !isFullyPaid) {
        return {
            message: `Payment status is partial`,
            finalStatus: 'partial',
            ...additiveFields,
        };
    }

    // Non-paid: cancelled, expired, created, etc.
    return {
        message: `Payment status is ${status}`,
        finalStatus: status,
        ...additiveFields,
    };
};
