'use strict';

/**
 * signup.js — register a new user.
 */

const clock = require('../../../utilities/clock');
const { hash } = require('../domain/passwordHasher');
const { sendRecoveryEmail, sendWelcomeEmail } = require('../domain/emailTemplates');
const { generateVerificationCode, isValidPassword, User, CouponMobile } = require('./_shared');

/**
 * Register a new user.
 *
 * platform: 'web' | 'mobile'
 *   - mobile: also checks phone uniqueness against User and Coupon collections
 *   - web: does not check phone in Coupon
 *
 * @returns {Promise<{ user: object, restored?: boolean }>}
 */
async function signup({ name, email, phone, password, platform = 'web' }) {
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
        existingUser.recoveryCodeExpires = clock.nowMs() + 15 * 60 * 1000;
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
    const hashedPassword = await hash(password);

    // Dead-code path preserved from original for parity (unreachable after checks above).
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
}

module.exports = signup;
