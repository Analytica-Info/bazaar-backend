'use strict';

const clock = require('../../../utilities/clock');
const { sendRecoveryEmail } = require('../domain/emailTemplates');
const { generateVerificationCode, User } = require('./_shared');

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

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
    user.recoveryCodeExpires = clock.nowMs() + 15 * 60 * 1000;
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
