'use strict';

const clock = require('../../../utilities/clock');
const { hash } = require('../domain/passwordHasher');
const { isValidPassword, User } = require('./_shared');

async function verifyRecoveryCode(email, recoveryCode, newPassword, platform = 'web') {
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

    if (clock.nowMs() > user.recoveryCodeExpires) {
        throw { status: 400, message: 'Recovery code has expired. Please request a new one.' };
    }

    if (!isValidPassword(newPassword)) {
        throw {
            status: 400,
            message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        };
    }

    const hashedPassword = await hash(newPassword);
    user.password = hashedPassword;
    user.isDeleted = false;
    user.deletedAt = null;
    user.recoveryCode = null;
    user.recoveryCodeExpires = null;
    if (platform === 'web') user.deletedBy = null;
    await user.save();

    return {};
}

module.exports = verifyRecoveryCode;
