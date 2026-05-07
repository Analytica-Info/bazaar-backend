'use strict';

const clock = require('../../../utilities/clock');
const { hash } = require('../domain/passwordHasher');
const { verifyAccessToken } = require('../domain/tokenIssuer');
const { sendResetPasswordEmail } = require('../domain/emailTemplates');
const { isValidPassword, User } = require('./_shared');
const Notification = require('../../../repositories').notifications.rawModel();

async function resetPassword(email, code, newPassword, platform = 'web') {
    if (!email || !code || !newPassword) {
        throw { status: 400, message: 'All fields are required' };
    }

    const user = await User.findOne({ email });
    if (!user) throw { status: 404, message: 'User not found' };

    if (!isValidPassword(newPassword)) {
        throw {
            status: 400,
            message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        };
    }

    if (!user.resetPasswordToken || user.resetPasswordExpires < clock.nowMs()) {
        throw { status: 400, message: 'Code expired or invalid' };
    }

    const decoded = verifyAccessToken(user.resetPasswordToken);
    if (decoded.code !== code) {
        throw { status: 400, message: 'Invalid code' };
    }

    const hashedPassword = await hash(newPassword);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    sendResetPasswordEmail(email);

    if (platform === 'web') {
        await Notification.create({
            email,
            title: 'Password Reset',
            message: 'Your Password Reset Successfully',
        });
    }

    return {};
}

module.exports = resetPassword;
