'use strict';

/**
 * Phone number normalization to E.164 format.
 *
 * E.164 format: +[country code][subscriber number]
 * Total digits: 8–15 (excluding the leading +)
 *
 * @module utilities/phone
 */

// E.164: + followed by 8–15 digits (country code + subscriber number).
// isValidE164 tests specify: +12345678 (8 digits) is valid min, +1234567 (7 digits) is invalid.
// Max is 15 digits after +.
const E164_RE = /^\+\d{8,15}$/;

/**
 * Strip all non-digit, non-plus characters, then strip interior spaces/dashes/parens.
 * Returns the stripped string preserving a leading +.
 *
 * @param {string} input
 * @returns {string}
 */
function stripFormatting(input) {
    // Remove spaces, dashes, parentheses
    return input.replace(/[\s\-()]/g, '');
}

/**
 * Return the digit-only portion of a string (no +).
 *
 * @param {string} s
 * @returns {string|null} digits, or null if non-digit chars remain
 */
function digitsOnly(s) {
    const d = s.replace(/\D/g, '');
    // If s had non-digit non-plus characters after stripping formatting, it's invalid.
    // We check: after removing all digits, nothing should remain except possibly leading +.
    const rest = s.replace(/^\+/, '').replace(/\d/g, '');
    if (rest.length > 0) return null;
    return d;
}

/**
 * Validate a candidate E.164 string (must start with + and have 7–15 digits after +).
 *
 * @param {string} candidate — already in the form +XXXXXXX...
 * @returns {boolean}
 */
function isValidE164(candidate) {
    if (typeof candidate !== 'string') return false;
    return E164_RE.test(candidate);
}

/**
 * Normalise a phone number string to E.164 format.
 *
 * Supported input patterns (after stripping whitespace/dashes/parens):
 *   1. Already E.164:     +971501234567   → +971501234567
 *   2. 00-prefix:         00971501234567  → +971501234567
 *   3. UAE leading zero:  0501234567      → +971501234567
 *   4. Raw with CC:       971501234567    → +971501234567
 *   5. Bare subscriber:   50123456        → +97150123456 (using defaultCountryCode)
 *
 * @param {string|null|undefined} phone
 * @param {'AE'} [defaultCountryCode='AE']
 * @returns {string|null} E.164 string, or null if the input cannot be normalised
 */
function toE164(phone, defaultCountryCode = 'AE') {
    if (phone == null) return null;
    if (typeof phone !== 'string') return null;

    const stripped = stripFormatting(phone);
    if (!stripped) return null;

    let candidate;

    // Case 1: starts with +
    if (stripped.startsWith('+')) {
        const afterPlus = stripped.slice(1);
        // Validate only digits after +
        if (/\D/.test(afterPlus)) return null;
        candidate = stripped;

    // Case 2: starts with 00 — replace with +
    } else if (stripped.startsWith('00')) {
        const afterDouble = stripped.slice(2);
        if (/\D/.test(afterDouble)) return null;
        candidate = '+' + afterDouble;

    // Case 3: UAE leading zero — 0XXXXXXXXX (10 digits, starts with 0)
    } else if (stripped.startsWith('0')) {
        const afterZero = stripped.slice(1);
        if (/\D/.test(afterZero)) return null;
        const cc = defaultCountryCode === 'AE' ? '971' : '';
        candidate = '+' + cc + afterZero;

    // Case 4 / 5: no prefix — might have CC (e.g. 971501234567) or bare subscriber (e.g. 50123456)
    // Heuristic: 10+ raw digits → assume country code is already present, just prepend +.
    // 8–9 raw digits → bare subscriber, prepend default country code.
    // < 8 raw digits → too ambiguous/short to normalise → null.
    } else {
        if (/\D/.test(stripped)) return null;
        if (stripped.length < 8) return null;
        if (stripped.length >= 10) {
            // Likely includes country code
            candidate = '+' + stripped;
        } else {
            // 8 or 9 digits — bare subscriber, prepend default CC
            const cc = defaultCountryCode === 'AE' ? '971' : '';
            candidate = '+' + cc + stripped;
        }
    }

    // Final validation
    if (!isValidE164(candidate)) return null;
    return candidate;
}

module.exports = { toE164, isValidE164 };
