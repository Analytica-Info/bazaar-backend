/**
 * V2 Web Auth Controller (BFF layer)
 * Cookie-based sessions, remember-me support.
 */
const authService = require('../../../services/authService');
const { wrap } = require('../_shared/responseEnvelope');
const { toDomainError } = require('../_shared/errors');
const { asyncHandler } = require('../../../middleware');
const logger = require('../../../utilities/logger');
const JWT_SECRET = require('../../../config/jwtSecret');
const jwt = require('jsonwebtoken');
const runtimeConfig = require('../../../config/runtime');

const domain = process.env.DOMAIN;

exports.register = asyncHandler(async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        const result = await authService.register({ name, email, phone, password, platform: 'web' });
        const status = result.restored ? 200 : 201;
        return res.status(status).json(wrap(null, result.restored ? 'Account restored successfully' : 'User registered successfully'));
    } catch (error) {
        logger.error({ err: error }, 'v2 web register error');
        throw toDomainError(error);
    }
});

exports.login = asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
        logger.error({ err: error }, 'v2 web login error');
        throw toDomainError(error);
    }
});

exports.googleLogin = asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.appleLogin = asyncHandler(async (req, res) => {
    try {
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
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.logout = (req, res) => {
    res.clearCookie('user_token', { domain: domain || undefined, path: '/', secure: true, sameSite: 'none' });
    return res.status(200).json(wrap(null, 'Logged out successfully'));
};

exports.checkAuth = (req, res) => {
    const token = req.cookies.user_token;
    if (!token) return res.status(200).json(wrap({ authenticated: false }));
    jwt.verify(token, JWT_SECRET, (err) => {
        if (err) return res.status(200).json(wrap({ authenticated: false }));
        return res.status(200).json(wrap({ authenticated: true }));
    });
};

exports.forgotPassword = asyncHandler(async (req, res) => {
    try {
        await authService.forgotPassword(req.body.email);
        return res.status(200).json(wrap(null, 'Verification code sent to email'));
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.verifyCode = asyncHandler(async (req, res) => {
    try {
        await authService.verifyCode(req.body.email, req.body.code);
        return res.status(200).json(wrap(null, 'Code verified successfully'));
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.resetPassword = asyncHandler(async (req, res) => {
    try {
        const { email, code, new_password } = req.body;
        await authService.resetPassword(email, code, new_password, 'web');
        return res.status(200).json(wrap(null, 'Password reset successfully'));
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.updatePassword = asyncHandler(async (req, res) => {
    try {
        const { old_password, new_password } = req.body;
        await authService.updatePassword(req.user._id, old_password, new_password);
        return res.status(200).json(wrap(null, 'Password updated successfully'));
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.getUserData = asyncHandler(async (req, res) => {
    try {
        const result = await authService.getUserData(req.user._id, 'web');
        return res.status(200).json(wrap({
            user: result.data,
            coupon: result.coupon ?? null,
            totalOrderCount: result.totalOrderCount ?? null,
            usedFirst15Coupon: result.usedFirst15Coupon ?? null,
        }));
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.updateProfile = asyncHandler(async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;
        const filePath = req.file ? `${FRONTEND_BASE_URL}/${req.file.path.replace(/\\/g, '/')}` : undefined;
        const result = await authService.updateProfile(req.user._id, { name, email, phone }, filePath);
        return res.status(200).json(wrap({ user: result.user }, 'Profile updated successfully'));
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.deleteAccount = asyncHandler(async (req, res) => {
    try {
        await authService.deleteAccount(req.user._id, 'web');
        res.clearCookie('user_token', { domain: domain || undefined, path: '/', secure: true, sameSite: 'none' });
        return res.status(200).json(wrap(null, 'Account deleted successfully'));
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.verifyRecoveryCode = asyncHandler(async (req, res) => {
    try {
        const { email, recoveryCode, newPassword } = req.body;
        await authService.verifyRecoveryCode(email, recoveryCode, newPassword, 'web');
        return res.status(200).json(wrap(null, 'Account recovered successfully.'));
    } catch (error) {
        throw toDomainError(error);
    }
});

exports.resendRecoveryCode = asyncHandler(async (req, res) => {
    try {
        const { email } = req.body;
        const result = await authService.resendRecoveryCode(email);
        return res.status(200).json(wrap({ attemptsUsed: result.attemptsUsed, attemptsLeft: result.attemptsLeft }, 'Recovery code resent'));
    } catch (error) {
        throw toDomainError(error);
    }
});
