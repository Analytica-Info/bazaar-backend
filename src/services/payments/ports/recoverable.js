'use strict';

/**
 * @typedef {Object} RecoveryResult
 * @property {'paid'|'cancelled'|'expired'|'pending'|'unknown'} terminalState
 *   - paid:      provider confirms payment captured
 *   - cancelled: provider confirms user cancelled
 *   - expired:   provider confirms session timed out
 *   - pending:   no terminal state yet (still processing)
 *   - unknown:   provider returned data we can't classify (treat as pending; don't act)
 * @property {string} [reason] - optional human-readable note for logs
 * @property {object} [raw] - raw provider response (for diagnostics)
 */

/**
 * @typedef {Object} Recoverable
 * @description A provider supports recovery if it can answer
 *   "what's the terminal state of this paymentId?" via a polling query.
 *   Stripe and Tabby have webhooks; Nomod does not, so polling is the only
 *   option for Nomod and the typedef is provider-agnostic so we can extend.
 *
 * @property {(paymentId: string) => Promise<RecoveryResult>} queryPaymentState
 */

module.exports = {}; // typedef-only file
