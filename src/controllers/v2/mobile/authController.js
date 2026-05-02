/**
 * V2 Mobile Auth Controller (BFF layer)
 * Thin HTTP adapter — delegates all logic to authService / userService.
 */
const authService = require('../../../services/authService');
const { wrap, wrapError } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');
const { asyncHandler } = require('../../../middleware');
const logger = require('../../../utilities/logger');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

exports.register = asyncHandler(async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        const result = await authService.register({ name, email, phone, password, platform: 'mobile' });
        const status = result.restored ? 200 : 201;
        return res.status(status).json(wrap(null, result.restored ? 'Account restored successfully' : 'User registered successfully'));
    } catch (error) {
        logger.error({ err: error }, 'v2 register error');
        return handleError(res, error);
    }
});

exports.login = asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
        logger.error({ err: error }, 'v2 login error');
        return handleError(res, error);
    }
});

exports.googleLogin = asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
        logger.error({ err: error }, 'v2 google login error');
        return handleError(res, error);
    }
});

exports.appleLogin = asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
        logger.error({ err: error }, 'v2 apple login error');
        return handleError(res, error);
    }
});

exports.getUserData = asyncHandler(async (req, res) => {
    try {
        const result = await authService.getUserData(req.user._id, 'mobile');
        return res.status(200).json(wrap({
            user: result.data,
            coupon: result.coupon,
            totalOrderCount: result.totalOrderCount,
            usedFirst15Coupon: result.usedFirst15Coupon,
        }));
    } catch (error) {
        logger.error({ err: error }, 'v2 getUserData error');
        return handleError(res, error);
    }
});

exports.forgotPassword = asyncHandler(async (req, res) => {
    try {
        await authService.forgotPassword(req.body.email);
        return res.status(200).json(wrap(null, 'Verification code sent to email'));
    } catch (error) {
        return handleError(res, error);
    }
});

exports.verifyCode = asyncHandler(async (req, res) => {
    try {
        await authService.verifyCode(req.body.email, req.body.code);
        return res.status(200).json(wrap(null, 'Code verified successfully'));
    } catch (error) {
        return handleError(res, error);
    }
});

exports.resetPassword = asyncHandler(async (req, res) => {
    try {
        const { email, code, new_password } = req.body;
        await authService.resetPassword(email, code, new_password, 'mobile');
        return res.status(200).json(wrap(null, 'Password reset successfully'));
    } catch (error) {
        return handleError(res, error);
    }
});

exports.refreshToken = asyncHandler(async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json(wrapError('UNAUTHORIZED', 'No token provided'));
        }
        const result = await authService.refreshToken(token);
        return res.status(200).json(wrap({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
    } catch (error) {
        logger.error({ err: error }, 'v2 refreshToken error');
        return handleError(res, { status: 403, code: 'INVALID_TOKEN', message: error.message || 'Invalid or expired refresh token' });
    }
});

exports.checkAccessToken = asyncHandler(async (req, res) => {
    try {
        const accessToken = req.header('Authorization')?.replace('Bearer ', '');
        const refreshToken = req.header('Authorization-Refresh')?.replace('Bearer ', '');
        if (!accessToken) {
            return res.status(401).json(wrapError('UNAUTHORIZED', 'Access token missing'));
        }
        const result = await authService.checkAccessToken(accessToken, refreshToken);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
});

exports.updateProfile = asyncHandler(async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const filePath = req.file ? `${FRONTEND_BASE_URL}/${req.file.path.replace(/\\/g, '/')}` : undefined;
        const result = await authService.updateProfile(req.user._id, { name, email, phone }, filePath);
        return res.status(200).json(wrap({ user: result.user }, 'Profile updated successfully'));
    } catch (error) {
        return handleError(res, error);
    }
});

exports.deleteAccount = asyncHandler(async (req, res) => {
    try {
        await authService.deleteAccount(req.user._id, 'mobile');
        return res.status(200).json(wrap(null, 'Account deleted successfully'));
    } catch (error) {
        logger.error({ err: error }, 'v2 deleteAccount error');
        return handleError(res, error);
    }
});

exports.verifyRecoveryCode = asyncHandler(async (req, res) => {
    try {
        const { email, recoveryCode, newPassword } = req.body;
        await authService.verifyRecoveryCode(email, recoveryCode, newPassword, 'mobile');
        return res.status(200).json(wrap(null, 'Account recovered successfully. You can now log in.'));
    } catch (error) {
        return handleError(res, error);
    }
});

exports.resendRecoveryCode = asyncHandler(async (req, res) => {
    try {
        const { email } = req.body;
        const result = await authService.resendRecoveryCode(email);
        return res.status(200).json(wrap({ attemptsUsed: result.attemptsUsed, attemptsLeft: result.attemptsLeft }, 'Recovery code resent successfully'));
    } catch (error) {
        return handleError(res, error);
    }
});

exports.updatePassword = asyncHandler(async (req, res) => {
    try {
        const { old_password, new_password } = req.body;
        await authService.updatePassword(req.user._id, old_password, new_password);
        return res.status(200).json(wrap(null, 'Password updated successfully'));
    } catch (error) {
        return handleError(res, error);
    }
});
