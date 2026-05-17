'use strict';
/**
 * V2 Mobile Auth Controller (BFF layer)
 * Thin HTTP adapter — delegates all logic to authService / userService.
 *
 * Every handler is wrapped with withAuthErrors, which catches service-layer
 * throws and translates them into user-friendly v2 error envelopes before
 * sending the response. The underlying service layer is never modified.
 */
const authService = require('../../../services/authService');
const { wrap, wrapError } = require('../_shared/responseEnvelope');
const { withAuthErrors } = require('../_shared/withAuthErrors');
const logger = require('../../../utilities/logger');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

exports.register = withAuthErrors(async (req, res) => {
    const { name, email, phone, password } = req.body;
    const result = await authService.register({ name, email, phone, password, platform: 'mobile' });
    const status = result.restored ? 200 : 201;
    return res.status(status).json(wrap(null, result.restored ? 'Account restored successfully' : 'User registered successfully'));
});

exports.login = withAuthErrors(async (req, res) => {
    const { email, password, fcmToken } = req.body;
    const deviceInfo = {
        'x-device-id': req.header('x-device-id') || req.body?.deviceId || null,
        'user-agent': req.headers['user-agent'] || null,
        'x-forwarded-for': req.headers['x-forwarded-for'] || null,
        'x-fcm-token': fcmToken || null,
    };
    const result = await authService.loginWithCredentials({ email, password, fcmToken, deviceInfo, platform: 'mobile' });
    return res.status(200).json(wrap({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        user: result.user,
        coupon: result.coupon,
        totalOrderCount: result.totalOrderCount,
        usedFirst15Coupon: result.usedFirst15Coupon,
    }));
});

/**
 * POST /auth/login/google
 * @description Log in with Google OAuth token (mobile).
 */
exports.loginGoogle = withAuthErrors(async (req, res) => {
    const { tokenId, accessToken, fcmToken } = req.body;
    const deviceInfo = {
        'x-device-id': req.header('x-device-id') || req.body?.deviceId || null,
        'user-agent': req.headers['user-agent'] || null,
        'x-forwarded-for': req.headers['x-forwarded-for'] || null,
        'x-fcm-token': fcmToken || null,
    };
    const result = await authService.googleLogin({ tokenId, accessToken, fcmToken, deviceInfo, platform: 'mobile', userAgent: req.headers['user-agent'] || '' });
    return res.status(200).json(wrap({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        user: result.user,
        coupon: result.coupon,
        totalOrderCount: result.totalOrderCount,
        usedFirst15Coupon: result.usedFirst15Coupon,
    }));
});

/**
 * POST /auth/login/apple
 * @description Log in with Apple Sign-In token (mobile).
 */
exports.loginApple = withAuthErrors(async (req, res) => {
    const { idToken, name, fcmToken } = req.body;
    const deviceInfo = {
        'x-device-id': req.header('x-device-id') || req.body?.deviceId || null,
        'user-agent': req.headers['user-agent'] || null,
        'x-forwarded-for': req.headers['x-forwarded-for'] || null,
        'x-fcm-token': fcmToken || null,
    };
    const result = await authService.appleLogin({ idToken, name, fcmToken, deviceInfo, platform: 'mobile' });
    return res.status(200).json(wrap({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        user: result.user,
        coupon: result.coupon,
        totalOrderCount: result.totalOrderCount,
        usedFirst15Coupon: result.usedFirst15Coupon,
    }));
});

/**
 * GET /me
 * @description Return the authenticated user's full data bundle (mobile).
 */
exports.getMe = withAuthErrors(async (req, res) => {
    const result = await authService.getUserData(req.user._id, 'mobile');
    return res.status(200).json(wrap({
        user: result.data,
        coupon: result.coupon,
        totalOrderCount: result.totalOrderCount,
        usedFirst15Coupon: result.usedFirst15Coupon,
    }));
});

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
    await authService.resetPassword(email, code, new_password, 'mobile');
    return res.status(200).json(wrap(null, 'Password reset successfully'));
});

/**
 * POST /auth/refresh
 * @description Exchange a refresh token for a new access/refresh token pair.
 */
exports.refresh = withAuthErrors(async (req, res) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json(wrapError('SESSION_MISSING', 'Please sign in to continue.'));
    }
    try {
        const result = await authService.refreshToken(token);
        return res.status(200).json(wrap({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
    } catch (err) {
        // Ensure service errors without a status are treated as 403 (invalid token)
        // so withAuthErrors can bucket them correctly.
        throw { status: err.status || 403, message: err.message || 'Invalid or expired refresh token' };
    }
});

/**
 * GET /auth/session
 * @description Check whether the current access token (and optional refresh token) is valid.
 * Reads tokens from Authorization / Authorization-Refresh headers (no body).
 */
exports.getSession = withAuthErrors(async (req, res) => {
    const accessToken = req.header('Authorization')?.replace('Bearer ', '');
    const refreshToken = req.header('Authorization-Refresh')?.replace('Bearer ', '');
    if (!accessToken) {
        return res.status(401).json(wrapError('SESSION_MISSING', 'Please sign in to continue.'));
    }
    const result = await authService.checkAccessToken(accessToken, refreshToken);
    return res.status(200).json(wrap(result));
});

/**
 * PATCH /me
 * @description Update the authenticated user's profile (name, email, phone, avatar).
 */
exports.updateMe = withAuthErrors(async (req, res) => {
    const { name, email, phone } = req.body;
    const filePath = req.file ? `${FRONTEND_BASE_URL}/${req.file.path.replace(/\\/g, '/')}` : undefined;
    const result = await authService.updateProfile(req.user._id, { name, email, phone }, filePath);
    return res.status(200).json(wrap({ user: result.user }, 'Profile updated successfully'));
});

/**
 * DELETE /me
 * @description Permanently delete the authenticated user's account.
 */
exports.deleteMe = withAuthErrors(async (req, res) => {
    await authService.deleteAccount(req.user._id, 'mobile');
    return res.status(200).json(wrap(null, 'Account deleted successfully'));
});

/**
 * POST /auth/recovery/verify
 * @description Verify a recovery code and set a new password.
 */
exports.verifyRecovery = withAuthErrors(async (req, res) => {
    const { email, recoveryCode, newPassword } = req.body;
    await authService.verifyRecoveryCode(email, recoveryCode, newPassword, 'mobile');
    return res.status(200).json(wrap(null, 'Account recovered successfully. You can now log in.'));
});

/**
 * POST /auth/recovery/resend
 * @description Resend the account recovery code.
 */
exports.resendRecovery = withAuthErrors(async (req, res) => {
    const { email } = req.body;
    const result = await authService.resendRecoveryCode(email);
    return res.status(200).json(wrap({ attemptsUsed: result.attemptsUsed, attemptsLeft: result.attemptsLeft }, 'Recovery code resent successfully'));
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

// Suppress unused import warning — logger is kept for future use
void logger;
