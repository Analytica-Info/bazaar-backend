'use strict';

/**
 * login.js — email/password login.
 */

const { compare } = require('../domain/passwordHasher');
const { generateTokens } = require('../domain/tokenIssuer');
const { upsertSession } = require('../domain/sessionState');
const { getCouponStatus, User, Order } = require('./_shared');
const runtimeConfig = require('../../../config/runtime');

/**
 * Login with email + password.
 *
 * platform: 'web' | 'mobile'
 *
 * @returns {Promise<{
 *   user: object, tokens: object, cookieMaxAge?: number,
 *   coupon: object, totalOrderCount: number,
 *   usedFirst15Coupon: boolean, fcmToken?: string
 * }>}
 */
async function loginWithCredentials({ email, password, fcmToken, rememberMe, deviceInfo, platform = 'web' }) {
    if (!email || !password) {
        throw { status: 400, message: 'Email and password are required' };
    }

    const user = await User.findOne({ email });
    if (!user) {
        throw { status: 400, message: platform === 'mobile' ? 'Invalid email' : 'Invalid email or password' };
    }

    if (user.isDeleted) {
        const message = user.deletedBy === 'admin'
            ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
            : 'Your account has been deleted. Please register again.';
        throw { status: 403, message };
    }

    if (user.isBlocked) {
        throw { status: 403, message: 'Your account has been blocked. Please contact support for assistance.' };
    }

    if (platform === 'mobile') {
        if (!user.password && (user.authProvider === 'google' || user.authProvider === 'apple')) {
            const providerName = user.authProvider === 'google' ? 'Google' : 'Apple';
            throw {
                status: 400,
                message: `This account was created using ${providerName} sign-in. Please use ${providerName} to login.`,
            };
        }
        if (!user.password) {
            throw { status: 400, message: 'Invalid email or password' };
        }
    }

    const isMatch = await compare(password, user.password);
    if (!isMatch) {
        throw { status: 400, message: 'Invalid email or password' };
    }

    let tokens;
    let cookieMaxAge;

    if (platform === 'mobile') {
        tokens = generateTokens(user, { accessExpiry: '1h', refreshExpiry: '7d' });
        if (fcmToken) user.fcmToken = fcmToken;
        upsertSession(user, deviceInfo || {}, tokens.refreshToken);
        await user.save();
    } else {
        const jwtExpiry = rememberMe ? '30d' : '7d';
        cookieMaxAge = rememberMe ? runtimeConfig.auth.rememberMeCookieMaxAgeMs : runtimeConfig.auth.sessionCookieMaxAgeMs;
        tokens = generateTokens(user, { accessExpiry: jwtExpiry, refreshExpiry: '7d' });
        if (fcmToken) {
            user.fcmToken = fcmToken;
            await user.save();
        }
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
        fcmToken: user.fcmToken,
    };
}

module.exports = loginWithCredentials;
