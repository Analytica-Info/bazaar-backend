'use strict';

/**
 * appleLogin.js — Apple OAuth login/signup.
 */

const appleSignin = require('apple-signin-auth');
const { generateTokens, decodeToken } = require('../domain/tokenIssuer');
const { upsertSession } = require('../domain/sessionState');
const { getCouponStatus, User, Order } = require('./_shared');
const runtimeConfig = require('../../../config/runtime');

/**
 * Apple login/signup.
 *
 * platform: 'web' | 'mobile'
 *
 * @returns {Promise<{ user: object, tokens: object, cookieMaxAge?: number, coupon: object, totalOrderCount?: number, usedFirst15Coupon: boolean, isNewUser: boolean }>}
 */
async function appleLogin({ idToken, code, authorizationCode, userData, name, fcmToken, rememberMe, deviceInfo, platform = 'web' }) {
    if (platform === 'mobile') {
        return _mobileAppleLogin({ idToken, name, fcmToken, deviceInfo });
    }
    return _webAppleLogin({ idToken, code, authorizationCode, userData, name, rememberMe });
}

async function _mobileAppleLogin({ idToken, name, fcmToken, deviceInfo }) {
    if (!idToken) {
        throw { status: 400, message: 'Missing Apple identity token' };
    }

    const appleClientId = process.env.APPLE_CLIENT_ID;
    const appleResponse = await appleSignin.verifyIdToken(idToken, {
        audience: appleClientId,
        ignoreExpiration: true,
    });

    const { email, sub } = appleResponse;
    let user = await User.findOne({ appleId: sub });

    if (user && user.isDeleted && user.deletedBy === 'admin') {
        throw { status: 403, message: 'Your account has been deleted by an administrator. Please contact support for assistance.' };
    }

    if (user && user.isBlocked) {
        throw { status: 403, message: 'Your account has been blocked. Please contact support for assistance.' };
    }

    let isNewUser = false;
    if (!user) {
        isNewUser = true;
        user = await User.create({
            email,
            name: name || 'Apple User',
            authProvider: 'apple',
            appleId: sub,
            fcmToken,
            platform: 'Mobile app',
        });
    } else {
        user.fcmToken = fcmToken;
        user.isDeleted = false;
        user.deletedAt = null;
        user.recoveryCode = null;
        user.recoveryCodeExpires = null;
        await user.save();
    }

    const tokens = generateTokens(user, { accessExpiry: '1h', refreshExpiry: '7d' });
    upsertSession(user, deviceInfo || {}, tokens.refreshToken);
    await user.save();

    const coupon = await getCouponStatus(user.phone, 'mobile');
    const totalOrderCount = await Order.countDocuments({ user_id: user._id });

    return {
        user: {
            name: user.name,
            email: user.email,
            avatar: user.avatar || '',
            phone: user.phone,
            role: user.role,
            provider: user.authProvider,
        },
        tokens,
        coupon,
        totalOrderCount,
        usedFirst15Coupon: user.usedFirst15Coupon || false,
        isNewUser,
    };
}

async function _webAppleLogin({ idToken, code, authorizationCode, userData, name, rememberMe }) {
    const authCode = authorizationCode || code || null;
    let identityToken = idToken || null;
    let email, firstName, lastName;

    if (userData) {
        try {
            const userInfo = typeof userData === 'string' ? JSON.parse(userData) : userData;
            if (userInfo.email) email = userInfo.email;
            if (userInfo.name?.firstName) firstName = userInfo.name.firstName;
            if (userInfo.name?.lastName) lastName = userInfo.name.lastName;
        } catch {
            // Ignore parse errors
        }
    }

    if (!identityToken) {
        if (!authCode || typeof authCode !== 'string') {
            throw { status: 400, message: 'Authorization code is required for Apple login' };
        }
        throw {
            status: 400,
            message: 'Apple code exchange must be handled by the controller',
            _needsCodeExchange: true,
            authCode,
        };
    }

    if (typeof identityToken !== 'string') {
        throw { status: 400, message: 'Invalid identity token' };
    }

    let decoded;
    try {
        decoded = decodeToken(identityToken, { complete: true });
        if (!decoded || !decoded.payload) {
            throw { status: 400, message: 'Invalid identity token payload' };
        }
    } catch (decodeError) {
        if (decodeError.status) throw decodeError;
        throw { status: 401, message: 'Invalid or malformed Apple identity token' };
    }

    const payload = decoded.payload;

    if (payload.iss !== 'https://appleid.apple.com') {
        throw { status: 401, message: 'Invalid token issuer' };
    }

    const appleWebClientId = process.env.APPLE_WEB_CLIENT_ID || process.env.APPLE_CLIENT_ID;
    if (appleWebClientId && payload.aud !== appleWebClientId) {
        throw { status: 401, message: 'Invalid token audience' };
    }

    const appleUserId = payload.sub;
    if (!email) email = payload.email || null;

    let existingUser = null;
    if (email) existingUser = await User.findOne({ email });
    if (!existingUser && appleUserId) existingUser = await User.findOne({ appleId: appleUserId });

    if (existingUser && existingUser.isDeleted) {
        const message = existingUser.deletedBy === 'admin'
            ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
            : 'Your account has been deleted. Please register again.';
        throw { status: 403, message };
    }

    if (existingUser && existingUser.isBlocked) {
        throw { status: 403, message: 'Your account has been blocked. Please contact support for assistance.' };
    }

    const jwtExpiry = rememberMe ? '30d' : '7d';
    const cookieMaxAge = rememberMe ? runtimeConfig.auth.rememberMeCookieMaxAgeMs : runtimeConfig.auth.sessionCookieMaxAgeMs;

    let isNewUser = false;
    let tokens;

    if (!existingUser) {
        isNewUser = true;
        const userName = (firstName && lastName
            ? `${firstName} ${lastName}`.trim()
            : firstName || lastName) || 'User';

        existingUser = new User({
            email: email || null,
            name: userName,
            appleId: appleUserId,
            authProvider: 'apple',
            address: [],
            platform: 'Website',
        });

        tokens = generateTokens(existingUser, { accessExpiry: jwtExpiry, refreshExpiry: '7d' });
        existingUser.refreshToken = tokens.refreshToken;
        await existingUser.save({ validateBeforeSave: false });
    } else {
        existingUser.isDeleted = false;
        existingUser.deletedAt = null;
        existingUser.recoveryCode = null;
        existingUser.recoveryCodeExpires = null;

        if (!existingUser.appleId && appleUserId) existingUser.appleId = appleUserId;
        if (email && !existingUser.email) existingUser.email = email;

        if (firstName || lastName) {
            const userName = (firstName && lastName
                ? `${firstName} ${lastName}`.trim()
                : firstName || lastName) || existingUser.name || 'User';
            existingUser.name = userName;
        }

        tokens = generateTokens(existingUser, { accessExpiry: jwtExpiry, refreshExpiry: '7d' });
        existingUser.refreshToken = tokens.refreshToken;
        await existingUser.save({ validateBeforeSave: false });
    }

    const coupon = await getCouponStatus(existingUser.phone, 'web');

    return {
        user: {
            name: existingUser.name,
            email: existingUser.email,
            avatar: existingUser.avatar || '',
            phone: existingUser.phone,
            role: existingUser.role,
            provider: existingUser.authProvider,
        },
        tokens,
        cookieMaxAge,
        coupon,
        isNewUser,
    };
}

module.exports = appleLogin;
