'use strict';

const clock = require('../../../utilities/clock');
const { sendRecoveryEmail } = require('../domain/emailTemplates');
const { generateVerificationCode, User } = require('./_shared');
const runtimeConfig = require('../../../config/runtime');
const { MAX_RECOVERY_ATTEMPTS } = require('../../../config/constants/business');

const MAX_ATTEMPTS = MAX_RECOVERY_ATTEMPTS;
const WINDOW_MS = runtimeConfig.auth.recoveryResendWindowMs;

async function resendRecoveryCode(email) {
    if (!email) throw { status: 400, message: 'Email is required.' };

    const user = await User.findOne({ email });
    if (!user || !user.isDeleted) {
        throw { status: 400, message: 'No deleted account found with this email.' };
    }

    const now = clock.now();

    if (user.lastRecoveryRequest && (now - user.lastRecoveryRequest) > WINDOW_MS) {
        user.recoveryAttempts = 0;
    }

    if (user.recoveryAttempts >= MAX_ATTEMPTS) {
        throw {
            status: 429,
            message: 'You have exceeded the maximum number of recovery attempts (5). Please try again after 24 hours.',
            attemptsLeft: 0,
        };
    }

    const recoveryCode = generateVerificationCode();
    user.recoveryCode = recoveryCode;
    user.recoveryCodeExpires = clock.nowMs() + runtimeConfig.auth.recoveryCodeExpiryMs;
    user.recoveryAttempts += 1;
    user.lastRecoveryRequest = now;
    await user.save();

    sendRecoveryEmail(user.email, recoveryCode);

    return {
        attemptsUsed: user.recoveryAttempts,
        attemptsLeft: MAX_ATTEMPTS - user.recoveryAttempts,
    };
}

module.exports = resendRecoveryCode;
