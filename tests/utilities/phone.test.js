'use strict';

const { toE164, isValidE164 } = require('../../src/utilities/phone');

describe('toE164', () => {
    // ── UAE local format ────────────────────────────────────────────────
    it('normalises UAE local (0501234567) to +971501234567', () => {
        expect(toE164('0501234567')).toBe('+971501234567');
    });

    it('normalises UAE local with spaces (050 123 4567) to +971501234567', () => {
        expect(toE164('050 123 4567')).toBe('+971501234567');
    });

    it('normalises UAE local with dashes (050-123-4567)', () => {
        expect(toE164('050-123-4567')).toBe('+971501234567');
    });

    // ── Already E.164 ───────────────────────────────────────────────────
    it('returns already-E164 (+971501234567) unchanged', () => {
        expect(toE164('+971501234567')).toBe('+971501234567');
    });

    it('strips formatting from E.164 with spaces (+971 50 123 4567)', () => {
        expect(toE164('+971 50 123 4567')).toBe('+971501234567');
    });

    it('strips parens and dashes from E.164 (+971 (50) 123-4567)', () => {
        expect(toE164('+971 (50) 123-4567')).toBe('+971501234567');
    });

    // ── 00-prefix ────────────────────────────────────────────────────────
    it('converts 00-prefix (00971501234567) to +971501234567', () => {
        expect(toE164('00971501234567')).toBe('+971501234567');
    });

    it('converts 00-prefix with spaces (0097 150 1234567)', () => {
        expect(toE164('0097 150 1234567')).toBe('+97150 1234567'.replace(/\s/g, ''));
        // explicit assertion:
        expect(toE164('00971 50 1234567')).toBe('+971501234567');
    });

    // ── Raw country code without + ───────────────────────────────────────
    it('prepends + when starts with country digits (971501234567)', () => {
        expect(toE164('971501234567')).toBe('+971501234567');
    });

    it('prepends + for a non-UAE country code with no + (12125551234)', () => {
        const result = toE164('12125551234');
        expect(result).toBe('+12125551234');
    });

    // ── Default country fallback ─────────────────────────────────────────
    it('uses AE default country code for bare 8-digit numbers', () => {
        // 8 digits starting with non-0 and not 971 prefix — treated as missing CC
        // e.g. a hypothetical short local number — prepend +971
        const result = toE164('50123456', 'AE');
        expect(result).toBe('+97150123456');
    });

    // ── Invalid inputs ───────────────────────────────────────────────────
    it('returns null for too-short number (fewer than 8 total digits)', () => {
        expect(toE164('1234567')).toBeNull();
    });

    it('returns null for too-long number (more than 15 digits)', () => {
        expect(toE164('+9715012345678901')).toBeNull();
    });

    it('returns null when number contains letters', () => {
        expect(toE164('+971abc12345')).toBeNull();
    });

    it('returns null for null input', () => {
        expect(toE164(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
        expect(toE164(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(toE164('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(toE164('   ')).toBeNull();
    });

    it('returns null for a number with + but non-digit rest', () => {
        expect(toE164('+abc')).toBeNull();
    });
});

describe('isValidE164', () => {
    it('returns true for valid E.164', () => {
        expect(isValidE164('+971501234567')).toBe(true);
    });

    it('returns true for minimum-length valid number (+12345678)', () => {
        expect(isValidE164('+12345678')).toBe(true);
    });

    it('returns true for maximum-length valid number (15 digits after +)', () => {
        expect(isValidE164('+123456789012345')).toBe(true);
    });

    it('returns false for number without + prefix', () => {
        expect(isValidE164('971501234567')).toBe(false);
    });

    it('returns false for null', () => {
        expect(isValidE164(null)).toBe(false);
    });

    it('returns false for number with letters', () => {
        expect(isValidE164('+97150abc1234')).toBe(false);
    });

    it('returns false for too-short number', () => {
        expect(isValidE164('+1234567')).toBe(false);
    });

    it('returns false for too-long number', () => {
        expect(isValidE164('+1234567890123456')).toBe(false);
    });
});
