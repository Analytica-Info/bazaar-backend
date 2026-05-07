'use strict';

const { hash, compare } = require('../domain/passwordHasher');
const { sendPasswordUpdateEmail } = require('../domain/emailTemplates');
const { isValidPassword, User } = require('./_shared');

async function updatePassword(userId, oldPassword, newPassword) {
    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found' };

    if (!isValidPassword(newPassword)) {
        throw {
            status: 400,
            message: 'Password must be at least 8 characters, include 1 uppercase letter, 1 number, and 1 special character',
        };
    }

    const userPassword = typeof user.password === 'string' ? user.password : String(user.password || '');
    if (!userPassword) throw { status: 400, message: 'Invalid password format' };

    const isMatch = await compare(oldPassword, userPassword);
    if (!isMatch) throw { status: 400, message: 'Old password is incorrect' };

    const isSame = await compare(newPassword, userPassword);
    if (isSame) throw { status: 400, message: 'New password must be different from the old password' };

    const hashedPassword = await hash(newPassword);
    user.password = hashedPassword;
    await user.save();

    sendPasswordUpdateEmail(user.email);

    return {};
}

module.exports = updatePassword;
