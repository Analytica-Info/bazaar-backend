'use strict';
/**
 * V2 Web Auth Controller (BFF layer)
 * Cookie-based sessions, remember-me support.
 *
 * Every handler is wrapped with withAuthErrors, which catches service-layer
 * throws and translates them into user-friendly v2 error envelopes before
 * sending the response. The underlying service layer is never modified.
 */
const authService = require('../../../services/authService');
const { wrap, wrapError } = require('../_shared/responseEnvelope');
const { withAuthErrors } = require('../_shared/withAuthErrors');
const logger = require('../../../utilities/logger');
const JWT_SECRET = require('../../../config/jwtSecret');
const jwt = require('jsonwebtoken');
const runtimeConfig = require('../../../config/runtime');

const domain = process.env.DOMAIN;

exports.register = withAuthErrors(async (req, res) => {
    const { name, email, phone, password } = req.body;
    const result = await authService.register({ name, email, phone, password, platform: 'web' });
    const status = result.restored ? 200 : 201;
    return res.status(status).json(wrap(null, result.restored ? 'Account restored successfully' : 'User registered successfully'));
});

exports.login = withAuthErrors(async (req, res) => {
    const { email, password, rememberMe, fcmToken } = req.body;
    const deviceInfo = {
        'x-device-id': req.header('x-device-id') || null,
        'user-agent': req.headers['user-agent'] || null,
        'x-forwarded-for': req.headers['x-forwarded-for'] || null,
    };
    const result = await authService.loginWithCredentials({ email, password, fcmToken, deviceInfo, platform: 'web', rememberMe });

    const cookieMaxAge = result.cookieMaxAge || (rememberMe ? runtimeConfig.auth.rememberMeCookieMaxAgeMs : runtimeConfig.auth.webCookieMaxAgeMs);
    res.cookie('user_token', result.tokens.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        domain: domain || undefined,
        maxAge: cookieMaxAge,
    });

    return res.status(200).json(wrap({
        user: result.user,
        coupon: result.coupon ?? null,
        totalOrderCount: result.totalOrderCount ?? null,
        usedFirst15Coupon: result.usedFirst15Coupon ?? null,
    }));
});

/**
 * POST /auth/login/google
 * @description Log in with Google OAuth token.
 */
exports.loginGoogle = withAuthErrors(async (req, res) => {
    const { tokenId, accessToken } = req.body;
    const result = await authService.googleLogin({ tokenId, accessToken, platform: 'web', userAgent: req.headers['user-agent'] || '' });

    res.cookie('user_token', result.tokens.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        domain: domain || undefined,
        maxAge: runtimeConfig.auth.webCookieMaxAgeMs,
    });

    return res.status(200).json(wrap({
        user: result.user,
        coupon: result.coupon ?? null,
        totalOrderCount: result.totalOrderCount ?? null,
        usedFirst15Coupon: result.usedFirst15Coupon ?? null,
    }));
});

/**
 * POST /auth/login/apple
 * @description Log in with Apple Sign-In token.
 */
exports.loginApple = withAuthErrors(async (req, res) => {
    const { idToken, name } = req.body;
    const result = await authService.appleLogin({ idToken, name, platform: 'web' });

    res.cookie('user_token', result.tokens.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        domain: domain || undefined,
        maxAge: runtimeConfig.auth.webCookieMaxAgeMs,
    });

    return res.status(200).json(wrap({
        user: result.user,
        coupon: result.coupon ?? null,
        totalOrderCount: result.totalOrderCount ?? null,
        usedFirst15Coupon: result.usedFirst15Coupon ?? null,
    }));
});

exports.logout = (req, res) => {
    res.clearCookie('user_token', { domain: domain || undefined, path: '/', secure: true, sameSite: 'none' });
    return res.status(200).json(wrap(null, 'Logged out successfully'));
};

/**
 * GET /auth/session
 * @description Check whether the current web session cookie is valid.
 */
exports.getSession = (req, res) => {
    const token = req.cookies.user_token;
    if (!token) return res.status(200).json(wrap({ authenticated: false }));
    jwt.verify(token, JWT_SECRET, (err) => {
        if (err) return res.status(200).json(wrap({ authenticated: false }));
        return res.status(200).json(wrap({ authenticated: true }));
    });
};

/**
 * POST /auth/password/forgot
 * @description Send a password-reset verification code to the given email.
 */
exports.passwordForgot = withAuthErrors(async (req, res) => {
    await authService.forgotPassword(req.body.email);
    return res.status(200).json(wrap(null, 'Verification code sent to email'));
});

/**
 * POST /auth/password/verify-code
 * @description Verify the password-reset code.
 */
exports.passwordVerifyCode = withAuthErrors(async (req, res) => {
    await authService.verifyCode(req.body.email, req.body.code);
    return res.status(200).json(wrap(null, 'Code verified successfully'));
});

/**
 * POST /auth/password/reset
 * @description Reset the password using the verified code.
 */
exports.passwordReset = withAuthErrors(async (req, res) => {
    const { email, code, new_password } = req.body;
    await authService.resetPassword(email, code, new_password, 'web');
    return res.status(200).json(wrap(null, 'Password reset successfully'));
});

/**
 * PATCH /me/password
 * @description Update the authenticated user's password.
 */
exports.updatePassword = withAuthErrors(async (req, res) => {
    const { old_password, new_password } = req.body;
    await authService.updatePassword(req.user._id, old_password, new_password);
    return res.status(200).json(wrap(null, 'Password updated successfully'));
});

/**
 * GET /me
 * @description Return the authenticated user's full data bundle.
 */
exports.getMe = withAuthErrors(async (req, res) => {
    const result = await authService.getUserData(req.user._id, 'web');
    return res.status(200).json(wrap({
        user: result.data,
        coupon: result.coupon ?? null,
        totalOrderCount: result.totalOrderCount ?? null,
        usedFirst15Coupon: result.usedFirst15Coupon ?? null,
    }));
});

/**
 * PATCH /me
 * @description Update the authenticated user's profile (name, email, phone, avatar).
 */
exports.updateMe = withAuthErrors(async (req, res) => {
    const { name, email, phone } = req.body;
    const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;
    const filePath = req.file ? `${FRONTEND_BASE_URL}/${req.file.path.replace(/\\/g, '/')}` : undefined;
    const result = await authService.updateProfile(req.user._id, { name, email, phone }, filePath);
    return res.status(200).json(wrap({ user: result.user }, 'Profile updated successfully'));
});

/**
 * DELETE /me
 * @description Permanently delete the authenticated user's account.
 */
exports.deleteMe = withAuthErrors(async (req, res) => {
    await authService.deleteAccount(req.user._id, 'web');
    res.clearCookie('user_token', { domain: domain || undefined, path: '/', secure: true, sameSite: 'none' });
    return res.status(200).json(wrap(null, 'Account deleted successfully'));
});

/**
 * POST /auth/recovery/verify
 * @description Verify a recovery code and set a new password.
 */
exports.verifyRecovery = withAuthErrors(async (req, res) => {
    const { email, recoveryCode, newPassword } = req.body;
    await authService.verifyRecoveryCode(email, recoveryCode, newPassword, 'web');
    return res.status(200).json(wrap(null, 'Account recovered successfully.'));
});

/**
 * POST /auth/recovery/resend
 * @description Resend the account recovery code.
 */
exports.resendRecovery = withAuthErrors(async (req, res) => {
    const { email } = req.body;
    const result = await authService.resendRecoveryCode(email);
    return res.status(200).json(wrap({ attemptsUsed: result.attemptsUsed, attemptsLeft: result.attemptsLeft }, 'Recovery code resent'));
});

// Suppress unused import warning — logger is kept for future use
void logger;
void wrapError;
