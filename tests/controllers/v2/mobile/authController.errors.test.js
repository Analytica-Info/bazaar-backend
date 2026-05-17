'use strict';

/**
 * v2 Mobile Auth Controller — error translation integration tests.
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
    refreshToken: jest.fn(),
    checkAccessToken: jest.fn(),
    updateProfile: jest.fn(),
    deleteAccount: jest.fn(),
    verifyRecoveryCode: jest.fn(),
    resendRecoveryCode: jest.fn(),
    updatePassword: jest.fn(),
}));
jest.mock('../../../../src/utilities/logger', () => ({
    info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(),
}));

const authService = require('../../../../src/services/authService');
const ctrl = require('../../../../src/controllers/v2/mobile/authController');

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

describe('mobile login — error translation', () => {
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
        expect(body.error.message).not.toContain('Invalid email or password');
    });

    it('maps "Your account has been blocked…" verbatim', async () => {
        authService.loginWithCredentials.mockRejectedValue({
            status: 403,
            message: 'Your account has been blocked. Please contact support for assistance.',
        });
        const res = makeRes();
        await ctrl.login(makeReq({ body: {} }), res);
        expect(res.status).toHaveBeenCalledWith(403);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('ACCOUNT_BLOCKED');
        expect(body.error.message).toBe('Your account has been blocked. Please contact support for assistance.');
    });

    it('never-mapped technical message → generic status-bucket message', async () => {
        authService.loginWithCredentials.mockRejectedValue({
            status: 500,
            message: 'MongoServerError: connection pool closed',
        });
        const res = makeRes();
        await ctrl.login(makeReq({ body: {} }), res);
        expect(res.status).toHaveBeenCalledWith(500);
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(false);
        expect(body.error.message).not.toContain('MongoServerError');
        expect(body.error.code).toBe('UNEXPECTED_ERROR');
    });
});

// ── register ──────────────────────────────────────────────────────────────────

describe('mobile register — error translation', () => {
    it('maps "User already exists with this email" → EMAIL_ALREADY_REGISTERED', async () => {
        authService.register.mockRejectedValue({
            status: 400,
            message: 'User already exists with this email',
        });
        const res = makeRes();
        await ctrl.register(makeReq({ body: {} }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(body.error.message).not.toBe('User already exists with this email');
    });

    it('maps weak password message → PASSWORD_TOO_WEAK', async () => {
        authService.register.mockRejectedValue({
            status: 400,
            message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        });
        const res = makeRes();
        await ctrl.register(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('PASSWORD_TOO_WEAK');
    });
});

// ── appleLogin ────────────────────────────────────────────────────────────────

describe('mobile appleLogin — error translation', () => {
    it('maps "Missing Apple identity token" → APPLE_SIGN_IN_FAILED', async () => {
        authService.appleLogin.mockRejectedValue({
            status: 400,
            message: 'Missing Apple identity token',
        });
        const res = makeRes();
        await ctrl.loginApple(makeReq({ body: {} }), res);
        expect(res.status).toHaveBeenCalledWith(400);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('APPLE_SIGN_IN_FAILED');
        expect(body.error.message).not.toContain('Apple identity token');
    });

    it('maps "Invalid token issuer" → APPLE_SIGN_IN_FAILED', async () => {
        authService.appleLogin.mockRejectedValue({
            status: 401,
            message: 'Invalid token issuer',
        });
        const res = makeRes();
        await ctrl.loginApple(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('APPLE_SIGN_IN_FAILED');
    });
});

// ── googleLogin ───────────────────────────────────────────────────────────────

describe('mobile googleLogin — error translation', () => {
    it('maps "Either tokenId or accessToken is required" → GOOGLE_SIGN_IN_FAILED', async () => {
        authService.googleLogin.mockRejectedValue({
            status: 400,
            message: 'Either tokenId or accessToken is required',
        });
        const res = makeRes();
        await ctrl.loginGoogle(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('GOOGLE_SIGN_IN_FAILED');
        expect(body.error.message).not.toContain('tokenId');
    });
});

// ── refreshToken ──────────────────────────────────────────────────────────────

describe('mobile refreshToken — error translation', () => {
    it('maps "Invalid or expired refresh token" → SESSION_EXPIRED', async () => {
        authService.refreshToken.mockRejectedValue({
            status: 403,
            message: 'Invalid or expired refresh token',
        });
        const req = makeReq();
        req.header = jest.fn().mockReturnValue('stale_token');
        const res = makeRes();
        await ctrl.refresh(req, res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('SESSION_EXPIRED');
        expect(body.error.message).not.toContain('refresh token');
    });
});

// ── forgotPassword ────────────────────────────────────────────────────────────

describe('mobile forgotPassword — error translation', () => {
    it('maps "User not found" → ACCOUNT_NOT_FOUND', async () => {
        authService.forgotPassword.mockRejectedValue({
            status: 404,
            message: 'User not found',
        });
        const res = makeRes();
        await ctrl.passwordForgot(makeReq({ body: { email: 'x@y.com' } }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('ACCOUNT_NOT_FOUND');
    });
});

// ── verifyCode ────────────────────────────────────────────────────────────────

describe('mobile verifyCode — error translation', () => {
    it('maps "Code expired or invalid" → CODE_INVALID', async () => {
        authService.verifyCode.mockRejectedValue({
            status: 400,
            message: 'Code expired or invalid',
        });
        const res = makeRes();
        await ctrl.passwordVerifyCode(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('CODE_INVALID');
    });
});

// ── updatePassword ────────────────────────────────────────────────────────────

describe('mobile updatePassword — error translation', () => {
    it('maps "Old password is incorrect" → CURRENT_PASSWORD_INCORRECT', async () => {
        authService.updatePassword.mockRejectedValue({
            status: 400,
            message: 'Old password is incorrect',
        });
        const res = makeRes();
        await ctrl.updatePassword(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('CURRENT_PASSWORD_INCORRECT');
        expect(body.error.message).not.toContain('Old password');
    });
});

// ── verifyRecoveryCode ────────────────────────────────────────────────────────

describe('mobile verifyRecoveryCode — error translation', () => {
    it('maps "Invalid recovery code." → RECOVERY_CODE_INVALID', async () => {
        authService.verifyRecoveryCode.mockRejectedValue({
            status: 400,
            message: 'Invalid recovery code.',
        });
        const res = makeRes();
        await ctrl.verifyRecovery(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('RECOVERY_CODE_INVALID');
    });

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

describe('mobile resendRecoveryCode — error translation', () => {
    it('maps rate-limit message → RECOVERY_RATE_LIMITED', async () => {
        authService.resendRecoveryCode.mockRejectedValue({
            status: 429,
            message: 'You have exceeded the maximum number of recovery attempts (5). Please try again after 24 hours.',
        });
        const res = makeRes();
        await ctrl.resendRecovery(makeReq({ body: {} }), res);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('RECOVERY_RATE_LIMITED');
        expect(body.error.message).not.toContain('maximum number of recovery attempts');
    });
});
