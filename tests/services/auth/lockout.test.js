'use strict';

/**
 * lockout.test.js — pure unit tests for domain/lockout.js.
 * Uses frozen clock via jest.useFakeTimers.
 */

const { checkResendAllowed, MAX_ATTEMPTS, WINDOW_MS } = require('../../../src/services/auth/domain/lockout');

describe('lockout.checkResendAllowed', () => {
    it('allows first attempt (no prior state)', () => {
        const state = {};
        const result = checkResendAllowed(state);
        expect(result.allowed).toBe(true);
        expect(result.attemptsLeft).toBe(MAX_ATTEMPTS - 1);
    });

    it('allows when attempts < MAX_ATTEMPTS', () => {
        const state = { recoveryAttempts: 3, lastRecoveryRequest: Date.now() };
        const result = checkResendAllowed(state);
        expect(result.allowed).toBe(true);
        expect(result.attemptsLeft).toBe(MAX_ATTEMPTS - 3 - 1);
    });

    it('blocks when attempts === MAX_ATTEMPTS', () => {
        const state = { recoveryAttempts: MAX_ATTEMPTS, lastRecoveryRequest: Date.now() };
        const result = checkResendAllowed(state);
        expect(result.allowed).toBe(false);
        expect(result.attemptsLeft).toBe(0);
    });

    it('resets attempts if last request was more than WINDOW_MS ago', () => {
        const longAgo = Date.now() - WINDOW_MS - 1000;
        const state = { recoveryAttempts: MAX_ATTEMPTS, lastRecoveryRequest: longAgo };
        const result = checkResendAllowed(state);
        // After reset, recoveryAttempts becomes 0, so it should be allowed
        expect(result.allowed).toBe(true);
    });

    it('does not reset attempts if within the window', () => {
        const recent = Date.now() - 1000; // 1 second ago
        const state = { recoveryAttempts: MAX_ATTEMPTS, lastRecoveryRequest: recent };
        const result = checkResendAllowed(state);
        expect(result.allowed).toBe(false);
    });

    it('mutates state.recoveryAttempts to 0 on window reset', () => {
        const longAgo = Date.now() - WINDOW_MS - 1000;
        const state = { recoveryAttempts: MAX_ATTEMPTS, lastRecoveryRequest: longAgo };
        checkResendAllowed(state);
        expect(state.recoveryAttempts).toBe(0);
    });

    it('handles missing lastRecoveryRequest gracefully', () => {
        const state = { recoveryAttempts: 2 };
        const result = checkResendAllowed(state);
        expect(result.allowed).toBe(true);
    });
});
