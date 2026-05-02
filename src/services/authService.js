const User = require('../repositories').users.rawModel();
const Order = require('../repositories').orders.rawModel();
const Coupon = require('../repositories').coupons.rawModel();
const CouponMobile = require('../repositories').couponsMobile.rawModel();
const CouponsCount = require('../repositories').couponsCount.rawModel();
const Notification = require('../repositories').notifications.rawModel();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { isValidPassword } = require('../helpers/validator');
const { verifyEmailWithVeriEmail } = require('../helpers/verifyEmail');
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth');
const axios = require('axios');
const JWT_SECRET = require('../config/jwtSecret');
const JWT_REFRESH_SECRET = require('../config/refreshJwtSecret');
const { sendEmail } = require('../mail/emailService');
const backendLogger = require('../utilities/backendLogger');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ---------------------------------------------------------------------------
// Private helpers (not exported)
// ---------------------------------------------------------------------------

const getDeviceInfo = (headers) => {
    const deviceId = headers['x-device-id'] || null;
    const userAgent = headers['user-agent'] || null;
    const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
    const fcmToken = headers['x-fcm-token'] || null;
    return { deviceId, userAgent, ip, fcmToken };
};

const upsertSession = (user, { deviceId, userAgent, ip, fcmToken }, refreshToken) => {
    const stableDeviceId = deviceId || `${userAgent || 'unknown'}:${(Math.random() + 1).toString(36).slice(2)}`;
    if (!Array.isArray(user.sessions)) user.sessions = [];
    let session = user.sessions.find(s => s.deviceId === stableDeviceId);
    if (session) {
        session.refreshToken = refreshToken;
        session.userAgent = userAgent;
        session.ip = ip;
        session.lastUsed = new Date();
        session.revokedAt = null;
        if (fcmToken) session.fcmToken = fcmToken;
    } else {
        user.sessions.push({
            deviceId: stableDeviceId,
            refreshToken,
            fcmToken: fcmToken || null,
            userAgent,
            ip,
            createdAt: new Date(),
            lastUsed: new Date(),
            revokedAt: null
        });
        const MAX_SESSIONS = 10;
        if (user.sessions.length > MAX_SESSIONS) {
            user.sessions.sort((a, b) => new Date(a.lastUsed) - new Date(b.lastUsed));
            user.sessions = user.sessions.slice(-MAX_SESSIONS);
        }
    }
    return stableDeviceId;
};

const generateTokens = (user, options = {}) => {
    const { accessExpiry = '1h', refreshExpiry = '7d' } = options;
    const accessToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: accessExpiry });
    const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: refreshExpiry });
    return { accessToken, refreshToken };
};

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Fetch coupon status for a user (used in login/getUserData responses).
 * Mobile uses the Coupons model, ecommerce uses the Coupon model.
 */
const getCouponStatus = async (phone, platform) => {
    let state = false;
    let dataCoupon = [];

    if (!phone) return { status: state, data: dataCoupon };

    const CouponModel = platform === 'mobile' ? CouponMobile : Coupon;
    const couponData = await CouponModel.findOne({ phone });
    if (couponData) {
        state = true;
        dataCoupon = couponData;
    }
    return { status: state, data: dataCoupon };
};

// ---------------------------------------------------------------------------
// Email helpers (private, exact HTML from original controllers)
// ---------------------------------------------------------------------------

const sendRecoveryEmail = async (email, code) => {
    const logoUrl = 'https://www.bazaar-uae.com/logo.png';
    const subject = 'Account Recovery Code – Verify to Reactivate Your Account';
    const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 15px; margin-bottom:5px;">
                                                        <strong style="display: block;font-size: 13px; margin: 0 0 4px; color:rgba(0,0,0,.64); font-weight:normal;">
                                                            Your Recovery code is <strong>${code}</strong>
                                                        </strong>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>
                                                        <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px; padding-left: 15px; padding-right: 15px;">Please note that this code is valid for the next <strong>15 minutes</strong>. If you did not request this, please ignore this email.</p>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>`;

    sendEmail(email, subject, html);
};

const sendWelcomeEmail = async (email) => {
    const logoUrl = 'https://www.bazaar-uae.com/logo.png';
    const subject = `Welcome to Bazaar`;
    const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <p>Thank you for signing up with <strong>Bazaar</strong></p>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>`;

    await sendEmail(email, subject, html);
};

const sendforgotPasswordEmail = async (email, verificationCode) => {
    const logoUrl = 'https://www.bazaar-uae.com/logo.png';
    const subject = 'Password Reset Verification Code';
    const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                        <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                            style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                            <tr>
                                <td>
                                    <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                        align="center" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="height:40px;">&nbsp;</td>
                                        </tr>
                                        <tr>
                                            <td style="text-align:center;">
                                                <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                    <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                                </a>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="height:20px;">&nbsp;</td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                    style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <tr>
                                                        <td style="height:40px;">&nbsp;</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:0 15px; margin-bottom:5px;">
                                                            <strong style="display: block;font-size: 13px; margin: 0 0 4px; color:rgba(0,0,0,.64); font-weight:normal;">
                                                                Your verification code is <strong>${verificationCode}</strong>
                                                            </strong>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td>
                                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px; padding-left: 15px; padding-right: 15px;">Please note that this code is valid for the next <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="height:40px;">&nbsp;</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="height:20px;">&nbsp;</td>
                                        </tr>
                                        <tr>
                                            <td style="text-align:center;">
                                                <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="height:80px;">&nbsp;</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </body>`;

    await sendEmail(email, subject, html);
};

const sendresetPasswordEmail = async (email) => {
    const logoUrl = 'https://www.bazaar-uae.com/logo.png';
    const subject = `Your Password Has Been Reset Successfully`;
    const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <p>We wanted to let you know that your password was successfully reset.</p>
                                                        <p>If you did not perform this action, please contact our support team immediately.</p>
                                                        <a href="mailto:info@bazaar-uae.com">info@bazaar-uae.com</a>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>`;

    await sendEmail(email, subject, html);
};

const sendPasswordUpdateEmail = async (email) => {
    const logoUrl = 'https://www.bazaar-uae.com/logo.png';
    const subject = `Your password was successfully updated`;
    const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <p>We wanted to let you know that your password was successfully updated.</p>
                                                        <p>If this wasn't you, please secure your account by resetting your password or contacting our support team.</p>
                                                        <a href="mailto:info@bazaar-uae.com">info@bazaar-uae.com</a>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>`;

    await sendEmail(email, subject, html);
};

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

/**
 * Register a new user.
 *
 * platform: 'web' | 'mobile'
 *   - mobile: also checks phone uniqueness against User and Coupon collections
 *   - web: does not check phone in Coupon
 *
 * Returns { user } on success.
 * Throws { status, message, existingUser? } on validation/business errors.
 */
exports.register = async ({ name, email, phone, password, platform = 'web' }) => {
    if (!name || !email || !phone || !password) {
        throw { status: 400, message: 'All fields are required' };
    }

    if (!isValidPassword(password)) {
        throw {
            status: 400,
            message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        };
    }

    const existingUser = await User.findOne({ email });

    // Mobile-specific: check phone uniqueness in User and Coupon collections
    if (platform === 'mobile') {
        const existingPhoneUser = await User.findOne({ phone });
        if (existingPhoneUser) {
            throw { status: 400, message: 'Phone already exists with another user' };
        }

        const existingPhoneCoupon = await CouponMobile.findOne({ phone });
        if (existingPhoneCoupon) {
            throw { status: 400, message: 'Phone already exists in coupons' };
        }
    }

    if (existingUser && existingUser.isDeleted) {
        const recoveryCode = generateVerificationCode();
        existingUser.recoveryCode = recoveryCode;
        existingUser.recoveryCodeExpires = Date.now() + 15 * 60 * 1000;
        await existingUser.save();

        sendRecoveryEmail(existingUser.email, recoveryCode);

        throw {
            status: 403,
            existingUser: true,
            message: 'An account with this email was previously deleted. We have sent a recovery code to this email. Kindly verify it to recover your account.',
        };
    }

    if (existingUser && !existingUser.isDeleted) {
        throw { status: 400, message: 'User already exists with this email' };
    }

    const platformLabel = platform === 'mobile' ? 'Mobile app' : 'Website';

    const hashedPassword = await bcrypt.hash(password, 10);

    // Dead-code path preserved from original: if existingUser is deleted and was
    // already handled above, this block would not run. Kept for parity.
    if (existingUser && existingUser.isDeleted) {
        existingUser.name = name;
        existingUser.phone = phone;
        existingUser.password = hashedPassword;
        existingUser.isDeleted = false;
        existingUser.deletedAt = null;
        existingUser.authProvider = 'local';
        existingUser.platform = platformLabel;

        await existingUser.save();

        return { user: existingUser, restored: true };
    }

    const user = await User.create({
        name,
        email,
        phone,
        password: hashedPassword,
        authProvider: 'local',
        platform: platformLabel,
    });

    sendWelcomeEmail(email);

    return { user };
};

/**
 * Login with email + password.
 *
 * platform: 'web' | 'mobile'
 *   - web:    token expiry based on rememberMe (7d or 30d). Controller sets cookie.
 *   - mobile: 1h access + 7d refresh, session-based. Controller returns tokens in body.
 *
 * Returns { user, tokens: { accessToken, refreshToken }, cookieMaxAge? }
 */
exports.loginWithCredentials = async ({ email, password, fcmToken, rememberMe, deviceInfo, platform = 'web' }) => {
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
        throw {
            status: 403,
            message: 'Your account has been blocked. Please contact support for assistance.',
        };
    }

    // Mobile-specific: check for social-only accounts
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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw { status: 400, message: 'Invalid email or password' };
    }

    let tokens;
    let cookieMaxAge;

    if (platform === 'mobile') {
        // Mobile: 1h access, 7d refresh, session-based
        tokens = generateTokens(user, { accessExpiry: '1h', refreshExpiry: '7d' });

        if (fcmToken) {
            user.fcmToken = fcmToken;
        }
        upsertSession(user, deviceInfo || {}, tokens.refreshToken);
        await user.save();
    } else {
        // Web: rememberMe-aware expiry, cookie-based
        const jwtExpiry = rememberMe ? '30d' : '7d';
        cookieMaxAge = rememberMe
            ? 30 * 24 * 60 * 60 * 1000
            : 7 * 24 * 60 * 60 * 1000;

        tokens = generateTokens(user, { accessExpiry: jwtExpiry, refreshExpiry: '7d' });

        if (fcmToken) {
            user.fcmToken = fcmToken;
            await user.save();
        }
    }

    // Coupon lookup
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
};

/**
 * Google login/signup.
 *
 * platform: 'web' | 'mobile'
 *   - mobile: uses accessToken OR tokenId, platform-specific Google Client IDs
 *   - web:    uses tokenId only, rememberMe-aware expiry, cookie-based
 *
 * Returns { user, tokens, cookieMaxAge?, isNewUser }
 */
exports.googleLogin = async ({ tokenId, accessToken, fcmToken, rememberMe, deviceInfo, platform = 'web', userAgent }) => {
    let GoogleId = process.env.GOOGLE_CLIENT_ID;

    if (platform === 'mobile') {
        // Mobile uses user-agent header to determine platform
        if (userAgent === 'android') {
            GoogleId = process.env.ANDROID_GOOGLE_CLIENT_ID;
        } else if (userAgent === 'ios') {
            GoogleId = process.env.IOS_GOOGLE_CLIENT_ID;
        }
    } else {
        // Web uses user-agent string matching
        const ua = (userAgent || '').toLowerCase();
        if (ua.includes('android')) {
            GoogleId = process.env.ANDROID_GOOGLE_CLIENT_ID;
        } else if (ua.includes('iphone') || ua.includes('ipad')) {
            GoogleId = process.env.IOS_GOOGLE_CLIENT_ID;
        }
    }

    let email, given_name, family_name, picture;

    if (accessToken) {
        // Mobile flow: use accessToken to fetch user info
        try {
            const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            email = response.data.email;
            given_name = response.data.given_name;
            family_name = response.data.family_name;
            picture = response.data.picture;
        } catch (error) {
            throw { status: 401, message: 'Invalid or expired Google access token' };
        }
    } else if (tokenId) {
        if (typeof tokenId !== 'string' || tokenId.split('.').length !== 3) {
            throw { status: 400, message: 'Invalid tokenId format' };
        }

        let ticket;
        try {
            ticket = await client.verifyIdToken({
                idToken: tokenId,
                audience: GoogleId,
            });
        } catch (verifyError) {
            throw { status: 401, message: 'Invalid or expired Google token' };
        }

        const payload = ticket.getPayload();
        email = payload.email;
        given_name = payload.given_name;
        family_name = payload.family_name;
        picture = payload.picture;
    } else {
        throw { status: 400, message: 'Either tokenId or accessToken is required' };
    }

    if (!email) {
        throw { status: 400, message: 'Email not provided by Google' };
    }

    let user = await User.findOne({ email });

    if (user && user.isDeleted && user.deletedBy === 'admin') {
        throw {
            status: 403,
            message: 'Your account has been deleted by an administrator. Please contact support for assistance.',
        };
    }

    // Web: also blocks non-admin self-deleted accounts
    if (platform === 'web' && user && user.isDeleted) {
        const message = user.deletedBy === 'admin'
            ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
            : 'Your account has been deleted. Please register again.';
        throw { status: 403, message };
    }

    if (user && user.isBlocked) {
        throw {
            status: 403,
            message: 'Your account has been blocked. Please contact support for assistance.',
        };
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
        // Existing user — restore if soft-deleted (mobile flow)
        if (platform === 'mobile') {
            user.fcmToken = fcmToken;
        }
        user.isDeleted = false;
        user.deletedAt = null;
        user.recoveryCode = null;
        user.recoveryCodeExpires = null;
        if (platform === 'web') {
            user.avatar = picture;
        }
    }

    let tokens;
    let cookieMaxAge;

    if (platform === 'mobile') {
        tokens = generateTokens(user, { accessExpiry: '1h', refreshExpiry: '7d' });
        upsertSession(user, deviceInfo || {}, tokens.refreshToken);
        await user.save();
    } else {
        const jwtExpiry = rememberMe ? '30d' : '7d';
        cookieMaxAge = rememberMe
            ? 30 * 24 * 60 * 60 * 1000
            : 7 * 24 * 60 * 60 * 1000;

        tokens = generateTokens(user, { accessExpiry: jwtExpiry, refreshExpiry: '7d' });
        user.refreshToken = tokens.refreshToken;
        await user.save({ validateBeforeSave: false });
    }

    // Coupon lookup
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
};

/**
 * Apple login/signup.
 *
 * platform: 'web' | 'mobile'
 *   - mobile: uses idToken directly from Apple SDK, session-based
 *   - web:    uses authorizationCode/code exchange, cookie-based, may redirect
 *
 * Returns { user, tokens, cookieMaxAge?, isNewUser }
 */
exports.appleLogin = async ({ idToken, code, authorizationCode, userData, name, fcmToken, rememberMe, deviceInfo, platform = 'web' }) => {
    if (platform === 'mobile') {
        // ---- Mobile Apple Login ----
        if (!idToken) {
            throw { status: 400, message: 'Missing Apple identity token' };
        }

        const appleClientId = process.env.APPLE_CLIENT_ID; // mobile: com.analytica.bazaarECommerce
        const appleResponse = await appleSignin.verifyIdToken(idToken, {
            audience: appleClientId,
            ignoreExpiration: true
        });

        const { email, sub } = appleResponse;
        let user = await User.findOne({ appleId: sub });

        if (user && user.isDeleted && user.deletedBy === 'admin') {
            throw {
                status: 403,
                message: 'Your account has been deleted by an administrator. Please contact support for assistance.',
            };
        }

        if (user && user.isBlocked) {
            throw {
                status: 403,
                message: 'Your account has been blocked. Please contact support for assistance.',
            };
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

    // ---- Web Apple Login ----
    const authCode = authorizationCode || code || null;
    let identityToken = idToken || null;
    let email, firstName, lastName;

    // Extract from userData if provided
    if (userData) {
        try {
            const userInfo = typeof userData === 'string' ? JSON.parse(userData) : userData;
            if (userInfo.email) email = userInfo.email;
            if (userInfo.name?.firstName) firstName = userInfo.name.firstName;
            if (userInfo.name?.lastName) lastName = userInfo.name.lastName;
        } catch (e) {
            // Ignore parse errors
        }
    }

    if (!identityToken) {
        if (!authCode || typeof authCode !== 'string') {
            throw { status: 400, message: 'Authorization code is required for Apple login' };
        }

        // Exchange code with Apple — caller must provide exchangeCodeWithApple
        // or we import the function. For now, throw to let the controller handle the exchange.
        throw {
            status: 400,
            message: 'Apple code exchange must be handled by the controller',
            _needsCodeExchange: true,
            authCode,
        };
    }

    if (!identityToken || typeof identityToken !== 'string') {
        throw { status: 400, message: 'Invalid identity token' };
    }

    let decoded;
    try {
        decoded = jwt.decode(identityToken, { complete: true });
        if (!decoded || !decoded.payload) {
            throw { status: 400, message: 'Invalid identity token payload' };
        }
    } catch (decodeError) {
        throw { status: 401, message: 'Invalid or malformed Apple identity token' };
    }

    const payload = decoded.payload;

    if (payload.iss !== 'https://appleid.apple.com') {
        throw { status: 401, message: 'Invalid token issuer' };
    }

    // Web Apple Sign-In uses a different client ID than mobile
    const appleWebClientId = process.env.APPLE_WEB_CLIENT_ID || process.env.APPLE_CLIENT_ID;
    if (appleWebClientId && payload.aud !== appleWebClientId) {
        throw { status: 401, message: 'Invalid token audience' };
    }

    const appleUserId = payload.sub;

    if (!email) {
        email = payload.email || null;
    }

    // Find existing user: prefer email, fall back to appleId
    let existingUser = null;
    if (email) {
        existingUser = await User.findOne({ email });
    }
    if (!existingUser && appleUserId) {
        existingUser = await User.findOne({ appleId: appleUserId });
    }

    if (existingUser && existingUser.isDeleted) {
        const message = existingUser.deletedBy === 'admin'
            ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
            : 'Your account has been deleted. Please register again.';
        throw { status: 403, message };
    }

    if (existingUser && existingUser.isBlocked) {
        throw {
            status: 403,
            message: 'Your account has been blocked. Please contact support for assistance.',
        };
    }

    const jwtExpiry = rememberMe ? '30d' : '7d';
    const cookieMaxAge = rememberMe
        ? 30 * 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

    let isNewUser = false;
    let tokens;

    if (!existingUser) {
        isNewUser = true;
        const userName =
            (firstName && lastName
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

        if (!existingUser.appleId && appleUserId) {
            existingUser.appleId = appleUserId;
        }

        if (email && !existingUser.email) {
            existingUser.email = email;
        }

        if (firstName || lastName) {
            const userName =
                (firstName && lastName
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
};

/**
 * Forgot password — generates verification code and sends email.
 * Both web and mobile controllers have identical logic for this.
 */
exports.forgotPassword = async (email) => {
    const user = await User.findOne({ email });

    if (!user) {
        throw { status: 404, message: 'User not found' };
    }

    if (user.isDeleted) {
        throw { status: 403, message: 'Your account has been deleted. Please register again.' };
    }

    if ((user.provider && user.provider !== 'local') ||
        (user.authProvider && user.authProvider !== 'local')) {
        throw { status: 400, message: 'Password reset is not available for social login accounts.' };
    }

    const verificationCode = generateVerificationCode();
    const token = jwt.sign({ code: verificationCode }, JWT_SECRET, { expiresIn: '10m' });

    sendforgotPasswordEmail(email, verificationCode);

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    return {};
};

/**
 * Verify the forgot-password code.
 */
exports.verifyCode = async (email, code) => {
    const user = await User.findOne({ email });

    if (!user) {
        throw { status: 404, message: 'User not found' };
    }

    if (!user.resetPasswordToken || user.resetPasswordExpires < Date.now()) {
        throw { status: 400, message: 'Code expired or invalid' };
    }

    const decoded = jwt.verify(user.resetPasswordToken, JWT_SECRET);
    if (decoded.code !== code) {
        throw { status: 400, message: 'Invalid code' };
    }

    return {};
};

/**
 * Reset password using the verification code.
 *
 * platform: 'web' | 'mobile'
 *   - web: also creates a Notification record
 */
exports.resetPassword = async (email, code, newPassword, platform = 'web') => {
    if (!email || !code || !newPassword) {
        throw { status: 400, message: 'All fields are required' };
    }

    const user = await User.findOne({ email });

    if (!user) {
        throw { status: 404, message: 'User not found' };
    }

    if (!isValidPassword(newPassword)) {
        throw {
            status: 400,
            message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        };
    }

    if (!user.resetPasswordToken || user.resetPasswordExpires < Date.now()) {
        throw { status: 400, message: 'Code expired or invalid' };
    }

    const decoded = jwt.verify(user.resetPasswordToken, JWT_SECRET);
    if (decoded.code !== code) {
        throw { status: 400, message: 'Invalid code' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    sendresetPasswordEmail(email);

    // Web flow creates a notification
    if (platform === 'web') {
        await Notification.create({
            email,
            title: 'Password Reset',
            message: 'Your Password Reset Successfully',
        });
    }

    return {};
};

/**
 * Update password for an authenticated user.
 *
 * userId: the authenticated user's _id
 */
exports.updatePassword = async (userId, oldPassword, newPassword) => {
    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: 'User not found' };
    }

    if (!isValidPassword(newPassword)) {
        throw {
            status: 400,
            message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        };
    }

    // Handle edge case from mobile controller: password might not be a string
    const userPassword = typeof user.password === 'string' ? user.password : String(user.password || '');

    if (!userPassword) {
        throw { status: 400, message: 'Invalid password format' };
    }

    const isMatch = await bcrypt.compare(oldPassword, userPassword);
    if (!isMatch) {
        throw { status: 400, message: 'Old password is incorrect' };
    }

    const isSame = await bcrypt.compare(newPassword, userPassword);
    if (isSame) {
        throw { status: 400, message: 'New password must be different from the old password' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    sendPasswordUpdateEmail(user.email);

    return {};
};

/**
 * Refresh an expired access token using a refresh token (mobile flow).
 *
 * refreshTokenValue: the refresh token from Authorization header
 */
exports.refreshToken = async (refreshTokenValue) => {
    if (!refreshTokenValue) {
        throw { status: 401, message: 'No token provided' };
    }

    let payload;
    try {
        payload = jwt.verify(refreshTokenValue, JWT_REFRESH_SECRET);
    } catch (error) {
        throw { status: 403, message: 'Invalid or expired refresh token' };
    }

    const user = await User.findById(payload.id);
    if (!user || !Array.isArray(user.sessions)) {
        throw { status: 403, message: 'User not found or sessions missing' };
    }

    const sessionIndex = user.sessions.findIndex(s => s.refreshToken === refreshTokenValue && !s.revokedAt);
    if (sessionIndex === -1) {
        throw { status: 403, message: 'Invalid refresh token' };
    }

    const newAccessToken = jwt.sign({ id: user._id }, JWT_SECRET, {
        expiresIn: '2m',
    });

    const newRefreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
        expiresIn: '7d',
    });

    user.sessions[sessionIndex].refreshToken = newRefreshToken;
    user.sessions[sessionIndex].lastUsed = new Date();
    await user.save();

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

/**
 * Check if an access token is valid. If expired, attempt refresh using the
 * refresh token (mobile flow).
 *
 * Returns { valid, message, userId?, accessToken?, refreshToken? }
 */
exports.checkAccessToken = async (accessTokenValue, refreshTokenValue) => {
    if (!accessTokenValue) {
        throw { status: 401, message: 'Access token missing' };
    }

    try {
        const decoded = jwt.verify(accessTokenValue, JWT_SECRET);
        return {
            valid: true,
            message: 'Access token is valid',
            userId: decoded.id,
        };
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            if (!refreshTokenValue) {
                throw { status: 401, message: 'Access token expired. Refresh token missing' };
            }

            let refreshDecoded;
            try {
                refreshDecoded = jwt.verify(refreshTokenValue, JWT_REFRESH_SECRET);
            } catch (refreshError) {
                throw { status: 403, message: 'Invalid or expired refresh token' };
            }

            const user = await User.findById(refreshDecoded.id);
            if (!user || !Array.isArray(user.sessions)) {
                throw { status: 403, message: 'Invalid refresh token' };
            }

            const sessionIndex = user.sessions.findIndex(s => s.refreshToken === refreshTokenValue && !s.revokedAt);
            if (sessionIndex === -1) {
                throw { status: 403, message: 'Invalid refresh token' };
            }

            const newAccessToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
            const newRefreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

            user.sessions[sessionIndex].refreshToken = newRefreshToken;
            user.sessions[sessionIndex].lastUsed = new Date();
            await user.save();

            return {
                valid: false,
                message: 'Access token expired. Issued new access token',
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
            };
        }

        throw { status: 401, message: 'Invalid access token' };
    }
};

/**
 * Delete account (authenticated user).
 *
 * platform: 'web' | 'mobile'
 *   - web: sets deletedBy = 'user'
 *   - mobile: does not set deletedBy (original mobile controller omits it)
 */
exports.deleteAccount = async (userId, platform = 'web') => {
    const user = await User.findById(userId);
    if (!user) {
        throw { status: 404, message: 'User not found' };
    }

    if (user.isDeleted) {
        throw { status: 400, message: 'Account already deleted' };
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    if (platform === 'web') {
        user.deletedBy = 'user';
    }
    await user.save();

    return {};
};

/**
 * Delete account via public endpoint (email + password, no auth token required).
 * From ecommerce userController.deleteAccountPublic.
 */
exports.deleteAccountPublic = async (email, password) => {
    if (!email || !password) {
        throw { status: 400, message: 'Email and password are required' };
    }

    const user = await User.findOne({ email });
    if (!user) {
        throw { status: 404, message: 'Invalid email or password' };
    }

    if (user.isDeleted) {
        throw { status: 400, message: 'Account already deleted' };
    }

    if (user.isBlocked) {
        throw {
            status: 403,
            message: 'Your account has been blocked. Please contact support for assistance.',
        };
    }

    if (!user.password) {
        throw {
            status: 400,
            message: 'This account was created with social login. Please contact support to delete your account.',
        };
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw { status: 400, message: 'Invalid email or password' };
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = 'user';
    await user.save();

    return {};
};

/**
 * Verify recovery code and restore a deleted account.
 * Both web and mobile have identical logic, except web also clears deletedBy.
 */
exports.verifyRecoveryCode = async (email, recoveryCode, newPassword, platform = 'web') => {
    if (!email || !recoveryCode || !newPassword) {
        throw { status: 400, message: 'Email, recovery code, and new password are required.' };
    }

    const user = await User.findOne({ email });

    if (!user || !user.isDeleted) {
        throw { status: 400, message: 'No deleted account found with this email.' };
    }

    if (user.recoveryCode !== recoveryCode) {
        throw { status: 400, message: 'Invalid recovery code.' };
    }

    if (Date.now() > user.recoveryCodeExpires) {
        throw { status: 400, message: 'Recovery code has expired. Please request a new one.' };
    }

    if (!isValidPassword(newPassword)) {
        throw {
            status: 400,
            message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.isDeleted = false;
    user.deletedAt = null;
    user.recoveryCode = null;
    user.recoveryCodeExpires = null;
    // Web controller also clears deletedBy
    if (platform === 'web') {
        user.deletedBy = null;
    }
    await user.save();

    return {};
};

/**
 * Resend recovery code with rate limiting.
 * Both web and mobile have identical logic.
 */
exports.resendRecoveryCode = async (email) => {
    if (!email) {
        throw { status: 400, message: 'Email is required.' };
    }

    const user = await User.findOne({ email });

    if (!user || !user.isDeleted) {
        throw { status: 400, message: 'No deleted account found with this email.' };
    }

    const now = new Date();

    if (
        user.lastRecoveryRequest &&
        (now - user.lastRecoveryRequest) > 24 * 60 * 60 * 1000
    ) {
        user.recoveryAttempts = 0;
    }

    if (user.recoveryAttempts >= 5) {
        throw {
            status: 429,
            message: 'You have exceeded the maximum number of recovery attempts (5). Please try again after 24 hours.',
            attemptsLeft: 0,
        };
    }

    const recoveryCode = generateVerificationCode();
    user.recoveryCode = recoveryCode;
    user.recoveryCodeExpires = Date.now() + 15 * 60 * 1000;
    user.recoveryAttempts += 1;
    user.lastRecoveryRequest = now;

    await user.save();

    sendRecoveryEmail(user.email, recoveryCode);

    return {
        attemptsUsed: user.recoveryAttempts,
        attemptsLeft: 5 - user.recoveryAttempts,
    };
};

/**
 * Update user profile.
 *
 * platform: 'web' | 'mobile'
 *   - web: supports username field, checks phone uniqueness in Coupon
 *   - mobile: checks phone uniqueness in User, Coupon (with $ne user_id), sets avatar with FRONTEND_BASE_URL
 *
 * avatarPath: already-processed file path string (controller builds the full URL)
 */
exports.updateProfile = async (userId, { name, email, phone, username }, avatarUrl) => {
    if (!name) throw { status: 400, message: 'Name is required' };
    if (!email) throw { status: 400, message: 'Email is required' };
    if (!phone) throw { status: 400, message: 'Phone is required' };

    const user = await User.findById(userId);
    if (!user) {
        throw { status: 404, message: 'User not found' };
    }

    // Check email uniqueness if changed
    if (email !== user.email) {
        const existingEmailUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingEmailUser) {
            throw { status: 400, message: 'Email already exists in another user' };
        }
    }

    // Check phone uniqueness if changed
    if (phone !== user.phone) {
        const existingUser = await User.findOne({ phone, _id: { $ne: userId } });
        if (existingUser) {
            throw { status: 400, message: 'Phone already exists in another user' };
        }

        const phoneInCoupon = await Coupon.findOne({ phone });
        if (phoneInCoupon) {
            throw { status: 400, message: 'Phone already exists in another user' };
        }
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (username) user.username = username;
    if (avatarUrl) user.avatar = avatarUrl;

    await user.save();

    return { user };
};

/**
 * Get user data (profile + coupon status + order count).
 * Used by mobile getUserData endpoint and as a utility.
 *
 * userId: the authenticated user's _id
 * platform: 'web' | 'mobile' — affects which Coupon model to check
 */
exports.getUserData = async (userId, platform = 'mobile') => {
    const user = await User.findById(userId);

    if (!user) {
        throw { status: 404, message: 'User not found' };
    }

    if (user.isDeleted) {
        const message = user.deletedBy === 'admin'
            ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
            : 'Your account has been deleted. Please register again.';
        throw { status: 403, message };
    }

    if (user.isBlocked) {
        throw {
            status: 403,
            message: 'Your account has been blocked. Please contact support for assistance.',
        };
    }

    const coupon = await getCouponStatus(user.phone, platform === 'mobile' ? 'mobile' : 'web');
    const totalOrderCount = await Order.countDocuments({ user_id: user._id });

    return {
        data: {
            name: user.name,
            email: user.email,
            avatar: user.avatar || '',
            role: user.role,
            phone: user.phone,
            provider: user.authProvider,
        },
        coupon,
        totalOrderCount,
        usedFirst15Coupon: user.usedFirst15Coupon || false,
    };
};

// Export helpers for use in controllers that need raw access
exports._helpers = {
    getDeviceInfo,
    upsertSession,
    generateTokens,
    generateVerificationCode,
};
