'use strict';

const clock = require('../../../utilities/clock');
const { signCodeToken } = require('../domain/tokenIssuer');
const { sendForgotPasswordEmail } = require('../domain/emailTemplates');
const { generateVerificationCode, User } = require('./_shared');

async function forgotPassword(email) {
    const user = await User.findOne({ email });

    if (!user) throw { status: 404, message: 'User not found' };

    if (user.isDeleted) {
        throw { status: 403, message: 'Your account has been deleted. Please register again.' };
    }

    if ((user.provider && user.provider !== 'local') ||
        (user.authProvider && user.authProvider !== 'local')) {
        throw { status: 400, message: 'Password reset is not available for social login accounts.' };
    }

    const verificationCode = generateVerificationCode();
    const token = signCodeToken({ code: verificationCode }, '10m');

    sendForgotPasswordEmail(email, verificationCode);

    user.resetPasswordToken = token;
    user.resetPasswordExpires = clock.nowMs() + 10 * 60 * 1000;
    await user.save();

    return {};
}

module.exports = forgotPassword;
