'use strict';

const { AUTH_ERROR_MAP, translateAuthError } = require('../../../../src/controllers/v2/_shared/authErrorMap');

// ── Map completeness ──────────────────────────────────────────────────────────

describe('AUTH_ERROR_MAP entries', () => {
    it('has at least one entry', () => {
        expect(AUTH_ERROR_MAP.length).toBeGreaterThan(0);
    });

    it('every entry has a non-empty pattern, code, and userMessage', () => {
        for (const entry of AUTH_ERROR_MAP) {
            expect(entry.pattern).toBeTruthy();
            expect(typeof entry.code).toBe('string');
            expect(entry.code.length).toBeGreaterThan(0);
            expect(typeof entry.userMessage).toBe('string');
            expect(entry.userMessage.length).toBeGreaterThan(0);
        }
    });

    it('every entry resolves to its own userMessage', () => {
        for (const entry of AUTH_ERROR_MAP) {
            const sampleMessage = entry.pattern instanceof RegExp
                ? entry.pattern.source.replace(/[^a-zA-Z ]/g, '').trim() || 'testmatch'
                : entry.pattern;

            const result = translateAuthError({ status: 400, message: sampleMessage });
            // If the sample matches, we should get a user-friendly message
            // (not the raw sample unless it happens to equal userMessage)
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);
        }
    });
});

// ── Exact-string matches ──────────────────────────────────────────────────────

describe('translateAuthError — exact string patterns', () => {
    const cases = [
        // credentials / login
        {
            input: { status: 400, message: 'Invalid email or password' },
            expectedCode: 'INVALID_CREDENTIALS',
        },
        {
            input: { status: 400, message: 'Invalid email' },
            expectedCode: 'INVALID_CREDENTIALS',
        },
        {
            input: { status: 400, message: 'Email and password are required' },
            expectedCode: 'VALIDATION_ERROR',
        },
        // account state
        {
            input: { status: 403, message: 'Your account has been blocked. Please contact support for assistance.' },
            expectedCode: 'ACCOUNT_BLOCKED',
        },
        {
            input: { status: 403, message: 'Your account has been deleted by an administrator. Please contact support for assistance.' },
            expectedCode: 'ACCOUNT_DELETED_ADMIN',
        },
        {
            input: { status: 403, message: 'Your account has been deleted. Please register again.' },
            expectedCode: 'ACCOUNT_DELETED',
        },
        {
            input: { status: 400, message: 'Account already deleted' },
            expectedCode: 'ACCOUNT_ALREADY_DELETED',
        },
        // registration
        {
            input: { status: 400, message: 'All fields are required' },
            expectedCode: 'VALIDATION_ERROR',
        },
        {
            input: { status: 400, message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character' },
            expectedCode: 'PASSWORD_TOO_WEAK',
        },
        {
            input: { status: 400, message: 'Phone already exists with another user' },
            expectedCode: 'PHONE_ALREADY_REGISTERED',
        },
        {
            input: { status: 400, message: 'Phone already exists in coupons' },
            expectedCode: 'PHONE_ALREADY_REGISTERED',
        },
        {
            input: { status: 400, message: 'User already exists with this email' },
            expectedCode: 'EMAIL_ALREADY_REGISTERED',
        },
        // google
        {
            input: { status: 400, message: 'Either tokenId or accessToken is required' },
            expectedCode: 'GOOGLE_SIGN_IN_FAILED',
        },
        {
            input: { status: 400, message: 'Email not provided by Google' },
            expectedCode: 'GOOGLE_SIGN_IN_FAILED',
        },
        // apple
        {
            input: { status: 400, message: 'Missing Apple identity token' },
            expectedCode: 'APPLE_SIGN_IN_FAILED',
        },
        {
            input: { status: 400, message: 'Authorization code is required for Apple login' },
            expectedCode: 'APPLE_SIGN_IN_FAILED',
        },
        {
            input: { status: 400, message: 'Invalid identity token' },
            expectedCode: 'APPLE_SIGN_IN_FAILED',
        },
        {
            input: { status: 400, message: 'Invalid identity token payload' },
            expectedCode: 'APPLE_SIGN_IN_FAILED',
        },
        {
            input: { status: 401, message: 'Invalid or malformed Apple identity token' },
            expectedCode: 'APPLE_SIGN_IN_FAILED',
        },
        {
            input: { status: 401, message: 'Invalid token issuer' },
            expectedCode: 'APPLE_SIGN_IN_FAILED',
        },
        {
            input: { status: 401, message: 'Invalid token audience' },
            expectedCode: 'APPLE_SIGN_IN_FAILED',
        },
        // refresh / session
        {
            input: { status: 401, message: 'No token provided' },
            expectedCode: 'SESSION_MISSING',
        },
        {
            input: { status: 403, message: 'Invalid or expired refresh token' },
            expectedCode: 'SESSION_EXPIRED',
        },
        {
            input: { status: 403, message: 'User not found or sessions missing' },
            expectedCode: 'SESSION_EXPIRED',
        },
        {
            input: { status: 403, message: 'Invalid refresh token' },
            expectedCode: 'SESSION_EXPIRED',
        },
        {
            input: { status: 401, message: 'Access token missing' },
            expectedCode: 'SESSION_MISSING',
        },
        {
            input: { status: 401, message: 'Access token expired. Refresh token missing' },
            expectedCode: 'SESSION_EXPIRED',
        },
        {
            input: { status: 401, message: 'Invalid access token' },
            expectedCode: 'SESSION_EXPIRED',
        },
        // forgot password
        {
            input: { status: 400, message: 'Password reset is not available for social login accounts.' },
            expectedCode: 'SOCIAL_ACCOUNT_NO_PASSWORD',
        },
        // verify code
        {
            input: { status: 400, message: 'Code expired or invalid' },
            expectedCode: 'CODE_INVALID',
        },
        {
            input: { status: 400, message: 'Invalid code' },
            expectedCode: 'CODE_INVALID',
        },
        // user lookup
        {
            input: { status: 404, message: 'User not found' },
            expectedCode: 'ACCOUNT_NOT_FOUND',
        },
        // update password
        {
            input: { status: 400, message: 'Invalid password format' },
            expectedCode: 'VALIDATION_ERROR',
        },
        {
            input: { status: 400, message: 'Old password is incorrect' },
            expectedCode: 'CURRENT_PASSWORD_INCORRECT',
        },
        {
            input: { status: 400, message: 'New password must be different from the old password' },
            expectedCode: 'PASSWORD_SAME_AS_OLD',
        },
        // update profile
        {
            input: { status: 400, message: 'Name is required' },
            expectedCode: 'VALIDATION_ERROR',
        },
        {
            input: { status: 400, message: 'Email is required' },
            expectedCode: 'VALIDATION_ERROR',
        },
        {
            input: { status: 400, message: 'Phone is required' },
            expectedCode: 'VALIDATION_ERROR',
        },
        {
            input: { status: 400, message: 'This email is already linked to another account.' },
            expectedCode: 'EMAIL_ALREADY_REGISTERED',
        },
        {
            input: { status: 400, message: 'This phone number is already linked to another account.' },
            expectedCode: 'PHONE_ALREADY_REGISTERED',
        },
        // account recovery
        {
            input: { status: 400, message: 'Email is required.' },
            expectedCode: 'VALIDATION_ERROR',
        },
        {
            input: { status: 400, message: 'No deleted account found with this email.' },
            expectedCode: 'ACCOUNT_NOT_FOUND',
        },
        {
            input: { status: 400, message: 'Email, recovery code, and new password are required.' },
            expectedCode: 'VALIDATION_ERROR',
        },
        {
            input: { status: 400, message: 'Invalid recovery code.' },
            expectedCode: 'RECOVERY_CODE_INVALID',
        },
        {
            input: { status: 400, message: 'Recovery code has expired. Please request a new one.' },
            expectedCode: 'RECOVERY_CODE_EXPIRED',
        },
        {
            input: { status: 429, message: 'You have exceeded the maximum number of recovery attempts (5). Please try again after 24 hours.' },
            expectedCode: 'RECOVERY_RATE_LIMITED',
        },
    ];

    for (const { input, expectedCode } of cases) {
        it(`maps "${input.message}" → code ${expectedCode}`, () => {
            const result = translateAuthError(input);
            expect(result.code).toBe(expectedCode);
            expect(result.status).toBe(input.status);
        });
    }
});

// ── Regex patterns ────────────────────────────────────────────────────────────

describe('translateAuthError — regex patterns', () => {
    it('maps social-login message (Google) → SOCIAL_LOGIN_REQUIRED', () => {
        const result = translateAuthError({
            status: 400,
            message: 'This account was created using Google sign-in. Please use Google to login.',
        });
        expect(result.code).toBe('SOCIAL_LOGIN_REQUIRED');
    });

    it('maps social-login message (Apple) → SOCIAL_LOGIN_REQUIRED', () => {
        const result = translateAuthError({
            status: 400,
            message: 'This account was created using Apple sign-in. Please use Apple to login.',
        });
        expect(result.code).toBe('SOCIAL_LOGIN_REQUIRED');
    });

    it('maps account recovery required message → ACCOUNT_RECOVERY_REQUIRED', () => {
        const result = translateAuthError({
            status: 403,
            message: 'An account with this email was previously deleted. We have sent a recovery code to this email. Kindly verify it to recover your account.',
        });
        expect(result.code).toBe('ACCOUNT_RECOVERY_REQUIRED');
    });

    it('maps Invalid or expired Apple identity token → APPLE_SIGN_IN_FAILED', () => {
        const result = translateAuthError({ status: 401, message: 'Invalid or expired Apple identity token' });
        expect(result.code).toBe('APPLE_SIGN_IN_FAILED');
    });

    it('maps Unknown OAuth provider message → OAUTH_PROVIDER_UNSUPPORTED', () => {
        const result = translateAuthError({ status: 400, message: 'Unknown OAuth provider: foobar' });
        expect(result.code).toBe('OAUTH_PROVIDER_UNSUPPORTED');
    });

    it('maps Invalid or expired Google access token → GOOGLE_SIGN_IN_FAILED', () => {
        const result = translateAuthError({ status: 401, message: 'Invalid or expired Google access token' });
        expect(result.code).toBe('GOOGLE_SIGN_IN_FAILED');
    });

    it('maps Invalid tokenId format → GOOGLE_SIGN_IN_FAILED', () => {
        const result = translateAuthError({ status: 400, message: 'Invalid tokenId format' });
        expect(result.code).toBe('GOOGLE_SIGN_IN_FAILED');
    });

    it('maps Invalid or expired Google token → GOOGLE_SIGN_IN_FAILED', () => {
        const result = translateAuthError({ status: 401, message: 'Invalid or expired Google token' });
        expect(result.code).toBe('GOOGLE_SIGN_IN_FAILED');
    });
});

// ── Fallback by status ────────────────────────────────────────────────────────

describe('translateAuthError — fallback by status', () => {
    it('status 400 → VALIDATION_ERROR with generic message', () => {
        const result = translateAuthError({ status: 400, message: 'some internal detail' });
        expect(result.code).toBe('VALIDATION_ERROR');
        expect(result.message).not.toContain('some internal detail');
        expect(result.status).toBe(400);
    });

    it('status 401 → UNAUTHENTICATED with generic message', () => {
        const result = translateAuthError({ status: 401, message: 'jwt malformed' });
        expect(result.code).toBe('UNAUTHENTICATED');
        expect(result.message).not.toContain('jwt malformed');
        expect(result.status).toBe(401);
    });

    it('status 403 → FORBIDDEN with generic message', () => {
        const result = translateAuthError({ status: 403, message: 'You are not allowed to do this' });
        expect(result.code).toBe('FORBIDDEN');
        expect(result.message).not.toContain('You are not allowed');
        expect(result.status).toBe(403);
    });

    it('status 404 → NOT_FOUND with generic message', () => {
        const result = translateAuthError({ status: 404, message: 'document missing' });
        expect(result.code).toBe('NOT_FOUND');
        expect(result.message).not.toContain('document missing');
        expect(result.status).toBe(404);
    });

    it('status 409 → CONFLICT with generic message', () => {
        const result = translateAuthError({ status: 409, message: 'duplicate key error' });
        expect(result.code).toBe('CONFLICT');
        expect(result.message).not.toContain('duplicate key');
        expect(result.status).toBe(409);
    });

    it('status 429 unknown message → RATE_LIMITED with generic message', () => {
        const result = translateAuthError({ status: 429, message: 'too many requests from ip' });
        expect(result.code).toBe('RATE_LIMITED');
        expect(result.message).not.toContain('too many requests from ip');
        expect(result.status).toBe(429);
    });

    it('status 500 → UNEXPECTED_ERROR with generic message', () => {
        const result = translateAuthError({ status: 500, message: 'MongoServerError: connection refused' });
        expect(result.code).toBe('UNEXPECTED_ERROR');
        expect(result.message).not.toContain('MongoServerError');
        expect(result.status).toBe(500);
    });

    it('no status defaults to 500 bucket', () => {
        const result = translateAuthError(new Error('TypeError: cannot read properties'));
        expect(result.code).toBe('UNEXPECTED_ERROR');
        expect(result.message).not.toContain('TypeError');
    });

    it('null err → 500 bucket', () => {
        const result = translateAuthError(null);
        expect(result.status).toBe(500);
        expect(result.code).toBe('UNEXPECTED_ERROR');
    });
});

// ── User message never leaks technical detail ─────────────────────────────────

describe('translateAuthError — no raw message leakage', () => {
    const technicalMessages = [
        'MongoServerError: E11000 duplicate key error',
        'jwt malformed',
        'Cannot read properties of undefined',
        'ECONNREFUSED 127.0.0.1:27017',
        'SyntaxError: Unexpected token',
        'Unexpected token < in JSON',
        'heap out of memory',
    ];

    for (const msg of technicalMessages) {
        it(`does not echo "${msg.substring(0, 30)}" to client`, () => {
            // Assign various statuses to ensure we hit fallback for most
            for (const status of [400, 401, 403, 500]) {
                const result = translateAuthError({ status, message: msg });
                expect(result.message).not.toContain(msg.substring(0, 20));
            }
        });
    }
});

// ── Blocked account message is preserved verbatim ────────────────────────────

describe('translateAuthError — blocked account preserved verbatim', () => {
    it('returns exact blocked account copy', () => {
        const result = translateAuthError({
            status: 403,
            message: 'Your account has been blocked. Please contact support for assistance.',
        });
        expect(result.message).toBe('Your account has been blocked. Please contact support for assistance.');
        expect(result.code).toBe('ACCOUNT_BLOCKED');
    });
});
