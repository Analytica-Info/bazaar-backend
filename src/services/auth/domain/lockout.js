'use strict';

/**
 * lockout.js — rate-limiting logic for recovery code resend.
 *
 * Pure business logic — no I/O. Uses a clock seam for
 * deterministic time in tests.
 */

const clock = require('../../../utilities/clock');

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Determine whether a recovery-code resend is allowed given the user's
 * current attempt state.
 *
 * Mutates `state` in-place (caller persists the updated state).
 *
 * @param {{ recoveryAttempts?: number, lastRecoveryRequest?: Date|number }} state
 * @returns {{ allowed: boolean, attemptsLeft: number }}
 *   If allowed === false, the caller should throw a 429 error.
 */
function checkResendAllowed(state) {
    const now = clock.now();

    // Reset window if last request was more than WINDOW_MS ago
    if (
        state.lastRecoveryRequest &&
        (now - state.lastRecoveryRequest) > WINDOW_MS
    ) {
        state.recoveryAttempts = 0;
    }

    const attempts = state.recoveryAttempts || 0;

    if (attempts >= MAX_ATTEMPTS) {
        return { allowed: false, attemptsLeft: 0 };
    }

    return { allowed: true, attemptsLeft: MAX_ATTEMPTS - attempts - 1 };
}

module.exports = { checkResendAllowed, MAX_ATTEMPTS, WINDOW_MS };
