'use strict';

/**
 * v2 Web Auth Controller — error translation integration tests.
 *
 * Verifies that withAuthErrors translates service-layer technical throws
 * into user-friendly v2 envelopes { success: false, error: { code, message } }.
 */

jest.mock('../../../../src/services/authService', () => ({
    register: jest.fn(),
    loginWithCredentials: jest.fn(),
    googleLogin: jest.fn(),
    appleLogin: jest.fn(),
    getUserData: jest.fn(),
    forgotPassword: jest.fn(),
    verifyCode: jest.fn(),
    resetPassword: jest.fn(),
    updatePassword: jest.fn(),
    updateProfile: jest.fn(),
    deleteAccount: jest.fn(),
    verifyRecoveryCode: jest.fn(),
    resendRecoveryCode: jest.fn(),
}));
jest.mock('../../../../src/utilities/logger', () => ({
    info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../../../src/config/jwtSecret', () => 'test_secret');
jest.mock('../../../../src/config/runtime', () => ({
    auth: {
        webCookieMaxAgeMs: 604800000,
        rememberMeCookieMaxAgeMs: 2592000000,
        sessionCookieMaxAgeMs: 604800000,
    },
}));

const authService = require('../../../../src/services/authService');
const ctrl = require('../../../../src/controllers/v2/web/authController');

const makeReq = (opts = {}) => ({
    user: opts.user || { _id: 'u1' },
    params: opts.params || {},
    body: opts.body || {},
    query: opts.query || {},
    headers: opts.headers || {},
    header: jest.fn((h) => (opts.headers || {})[h] || null),
    file: opts.file || null,
    cookies: opts.cookies || {},
});

const makeRes = () => {
    const r = {};
    r.status = jest.fn().mockReturnValue(r);
    r.json = jest.fn().mockReturnValue(r);
    r.cookie = jest.fn().mockReturnValue(r);
    r.clearCookie = jest.fn().mockReturnValue(r);
    return r;
};

beforeEach(() => jest.clearAllMocks());

// ── login ─────────────────────────────────────────────────────────────────────

describe('web login — error translation', () => {
    it('maps "Invalid email or password" → INVALID_CREDENTIALS with user-friendly message', async () => {
        authService.loginWithCredentials.mockRejectedValue({
            status: 401,
            message: 'Invalid email or password',
        });
        const res = makeRes();
        await ctrl.login(makeReq({ body: { email: 'a@b.com', password: 'wrong' } }), res);
        expect(res.status).toHaveBeenCalledWith(401);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('INVALID_CREDENTIALS');
        expect(body.error.message).toContain("doesn't match our records");
        expect(body.error.message).not.toBe('Invalid email or password');
    });

    it('maps "Your account has been blocked…" verbatim', async () => {
        authService.loginWithCredentials.mockRejectedValue({
            status: 403,
            message: 'Your account has been blocked. Please contact support for assistance.',
        });
        const res = makeRes();
        await ctrl.login(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('ACCOUNT_BLOCKED');
        expect(body.error.message).toBe('Your account has been blocked. Please contact support for assistance.');
    });

    it('never-mapped technical message → generic message, raw text not exposed', async () => {
        authService.loginWithCredentials.mockRejectedValue({
            status: 500,
            message: 'ECONNREFUSED 127.0.0.1:27017',
        });
        const res = makeRes();
        await ctrl.login(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(false);
        expect(body.error.message).not.toContain('ECONNREFUSED');
        expect(body.error.code).toBe('UNEXPECTED_ERROR');
    });
});

// ── register ──────────────────────────────────────────────────────────────────

describe('web register — error translation', () => {
    it('maps "User already exists with this email" → EMAIL_ALREADY_REGISTERED', async () => {
        authService.register.mockRejectedValue({
            status: 400,
            message: 'User already exists with this email',
        });
        const res = makeRes();
        await ctrl.register(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('maps account recovery required → ACCOUNT_RECOVERY_REQUIRED', async () => {
        authService.register.mockRejectedValue({
            status: 403,
            message: 'An account with this email was previously deleted. We have sent a recovery code to this email. Kindly verify it to recover your account.',
        });
        const res = makeRes();
        await ctrl.register(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('ACCOUNT_RECOVERY_REQUIRED');
    });
});

// ── googleLogin ───────────────────────────────────────────────────────────────

describe('web googleLogin — error translation', () => {
    it('maps "Email not provided by Google" → GOOGLE_SIGN_IN_FAILED', async () => {
        authService.googleLogin.mockRejectedValue({
            status: 400,
            message: 'Email not provided by Google',
        });
        const res = makeRes();
        await ctrl.loginGoogle(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('GOOGLE_SIGN_IN_FAILED');
        expect(body.error.message).not.toContain('not provided by Google');
    });
});

// ── appleLogin ────────────────────────────────────────────────────────────────

describe('web appleLogin — error translation', () => {
    it('maps "Invalid or malformed Apple identity token" → APPLE_SIGN_IN_FAILED', async () => {
        authService.appleLogin.mockRejectedValue({
            status: 401,
            message: 'Invalid or malformed Apple identity token',
        });
        const res = makeRes();
        await ctrl.loginApple(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('APPLE_SIGN_IN_FAILED');
    });
});

// ── forgotPassword ────────────────────────────────────────────────────────────

describe('web forgotPassword — error translation', () => {
    it('maps "User not found" → ACCOUNT_NOT_FOUND', async () => {
        authService.forgotPassword.mockRejectedValue({
            status: 404,
            message: 'User not found',
        });
        const res = makeRes();
        await ctrl.passwordForgot(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('ACCOUNT_NOT_FOUND');
        expect(body.error.message).not.toBe('User not found');
    });

    it('maps social login no-password message → SOCIAL_ACCOUNT_NO_PASSWORD', async () => {
        authService.forgotPassword.mockRejectedValue({
            status: 400,
            message: 'Password reset is not available for social login accounts.',
        });
        const res = makeRes();
        await ctrl.passwordForgot(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('SOCIAL_ACCOUNT_NO_PASSWORD');
    });
});

// ── updatePassword ────────────────────────────────────────────────────────────

describe('web updatePassword — error translation', () => {
    it('maps "Old password is incorrect" → CURRENT_PASSWORD_INCORRECT', async () => {
        authService.updatePassword.mockRejectedValue({
            status: 400,
            message: 'Old password is incorrect',
        });
        const res = makeRes();
        await ctrl.updatePassword(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('CURRENT_PASSWORD_INCORRECT');
    });
});

// ── updateProfile ─────────────────────────────────────────────────────────────

describe('web updateProfile — error translation', () => {
    it('maps "This email is already linked to another account." → EMAIL_ALREADY_REGISTERED', async () => {
        authService.updateProfile.mockRejectedValue({
            status: 400,
            message: 'This email is already linked to another account.',
        });
        const res = makeRes();
        await ctrl.updateMe(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });
});

// ── deleteAccount ─────────────────────────────────────────────────────────────

describe('web deleteAccount — error translation', () => {
    it('maps "Account already deleted" → ACCOUNT_ALREADY_DELETED', async () => {
        authService.deleteAccount.mockRejectedValue({
            status: 400,
            message: 'Account already deleted',
        });
        const res = makeRes();
        await ctrl.deleteMe(makeReq(), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('ACCOUNT_ALREADY_DELETED');
    });
});

// ── verifyRecoveryCode ────────────────────────────────────────────────────────

describe('web verifyRecoveryCode — error translation', () => {
    it('maps "Recovery code has expired." → RECOVERY_CODE_EXPIRED', async () => {
        authService.verifyRecoveryCode.mockRejectedValue({
            status: 400,
            message: 'Recovery code has expired. Please request a new one.',
        });
        const res = makeRes();
        await ctrl.verifyRecovery(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('RECOVERY_CODE_EXPIRED');
    });
});

// ── resendRecoveryCode ────────────────────────────────────────────────────────

describe('web resendRecoveryCode — error translation', () => {
    it('maps "No deleted account found with this email." → ACCOUNT_NOT_FOUND', async () => {
        authService.resendRecoveryCode.mockRejectedValue({
            status: 400,
            message: 'No deleted account found with this email.',
        });
        const res = makeRes();
        await ctrl.resendRecovery(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('ACCOUNT_NOT_FOUND');
    });
});
