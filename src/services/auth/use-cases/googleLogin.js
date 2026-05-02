'use strict';

/**
 * googleLogin.js — Google OAuth login/signup.
 */

const { generateTokens } = require('../domain/tokenIssuer');
const { upsertSession } = require('../domain/sessionState');
const googleVerifier = require('../adapters/googleVerifier');
const { getCouponStatus, User, Order } = require('./_shared');

/**
 * Google login/signup.
 *
 * platform: 'web' | 'mobile'
 *
 * @returns {Promise<{ user: object, tokens: object, cookieMaxAge?: number, coupon: object, totalOrderCount: number, usedFirst15Coupon: boolean, isNewUser: boolean }>}
 */
async function googleLogin({ tokenId, accessToken, fcmToken, rememberMe, deviceInfo, platform = 'web', userAgent }) {
    let profile;

    if (accessToken) {
        profile = await googleVerifier.verifyToken(accessToken, { isAccessToken: true });
    } else if (tokenId) {
        profile = await googleVerifier.verifyToken(tokenId, { isAccessToken: false, platform, userAgent });
    } else {
        throw { status: 400, message: 'Either tokenId or accessToken is required' };
    }

    const { email, given_name, family_name, picture } = profile;

    if (!email) {
        throw { status: 400, message: 'Email not provided by Google' };
    }

    let user = await User.findOne({ email });

    if (user && user.isDeleted && user.deletedBy === 'admin') {
        throw { status: 403, message: 'Your account has been deleted by an administrator. Please contact support for assistance.' };
    }

    if (platform === 'web' && user && user.isDeleted) {
        const message = user.deletedBy === 'admin'
            ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
            : 'Your account has been deleted. Please register again.';
        throw { status: 403, message };
    }

    if (user && user.isBlocked) {
        throw { status: 403, message: 'Your account has been blocked. Please contact support for assistance.' };
    }

    let isNewUser = false;
    const platformLabel = platform === 'mobile' ? 'Mobile app' : 'Website';

    if (!user) {
        isNewUser = true;
        if (platform === 'web') {
            user = new User({
                email,
                name: given_name || 'User',
                avatar: picture,
                authProvider: 'google',
                address: [],
                platform: platformLabel,
            });
        } else {
            user = await User.create({
                email,
                name: given_name,
                avatar: picture,
                authProvider: 'google',
                fcmToken,
                platform: platformLabel,
            });
        }
    } else {
        if (platform === 'mobile') user.fcmToken = fcmToken;
        user.isDeleted = false;
        user.deletedAt = null;
        user.recoveryCode = null;
        user.recoveryCodeExpires = null;
        if (platform === 'web') user.avatar = picture;
    }

    let tokens;
    let cookieMaxAge;

    if (platform === 'mobile') {
        tokens = generateTokens(user, { accessExpiry: '1h', refreshExpiry: '7d' });
        upsertSession(user, deviceInfo || {}, tokens.refreshToken);
        await user.save();
    } else {
        const jwtExpiry = rememberMe ? '30d' : '7d';
        cookieMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        tokens = generateTokens(user, { accessExpiry: jwtExpiry, refreshExpiry: '7d' });
        user.refreshToken = tokens.refreshToken;
        await user.save({ validateBeforeSave: false });
    }

    const coupon = await getCouponStatus(user.phone, platform === 'mobile' ? 'mobile' : 'web');
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
        cookieMaxAge,
        coupon,
        totalOrderCount,
        usedFirst15Coupon: user.usedFirst15Coupon || false,
        isNewUser,
    };
}

module.exports = googleLogin;
