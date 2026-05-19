'use strict';

const clock = require('../../../utilities/clock');
const logger = require('../../../utilities/logger');
const { signCodeToken } = require('../domain/tokenIssuer');
const { sendForgotPasswordEmail } = require('../domain/emailTemplates');
const { generateVerificationCode, User } = require('./_shared');
const runtimeConfig = require('../../../config/runtime');

/**
 * Initiate the password-reset flow for the given email.
 *
 * Security: this endpoint MUST NOT leak whether an email is registered (user
 * enumeration). All branches return success — the controller always responds
 * 200 "Verification code sent to email" — but we only actually send + persist
 * a reset token when the account exists, is not deleted, and is a local-auth
 * account. Non-matching / ineligible callers see the same UX but no email
 * is sent. Internal logs record the skip reason for audit/monitoring.
 *
 * Empty/missing email is still rejected with 400 from the controller layer
 * (input validation, not enumeration risk).
 */
async function forgotPassword(email) {
    if (!email) {
        throw { status: 400, message: 'Email is required.' };
    }

    const user = await User.findOne({ email });

    // Three "silently skip" cases — log internally, return 200 to the client.
    // Same response shape protects user enumeration in all branches.
    if (!user) {
        logger.info({ email }, 'forgotPassword: skipped — no account for email (200 returned)');
        return {};
    }

    if (user.isDeleted) {
        logger.info({ email, userId: String(user._id) }, 'forgotPassword: skipped — account is deleted (200 returned)');
        return {};
    }

    const isSocialLogin =
        (user.provider && user.provider !== 'local') ||
        (user.authProvider && user.authProvider !== 'local');
    if (isSocialLogin) {
        logger.info(
            { email, userId: String(user._id), provider: user.provider || user.authProvider },
            'forgotPassword: skipped — social login account (200 returned)'
        );
        return {};
    }

    const verificationCode = generateVerificationCode();
    const token = signCodeToken({ code: verificationCode }, '10m');

    sendForgotPasswordEmail(email, verificationCode);

    user.resetPasswordToken = token;
    user.resetPasswordExpires = clock.nowMs() + runtimeConfig.auth.resetPasswordExpiryMs;
    await user.save();

    return {};
}

module.exports = forgotPassword;
