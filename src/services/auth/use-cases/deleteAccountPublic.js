'use strict';

const clock = require('../../../utilities/clock');
const { compare } = require('../domain/passwordHasher');
const { User } = require('./_shared');

async function deleteAccountPublic(email, password) {
    if (!email || !password) throw { status: 400, message: 'Email and password are required' };

    const user = await User.findOne({ email });
    if (!user) throw { status: 404, message: 'Invalid email or password' };
    if (user.isDeleted) throw { status: 400, message: 'Account already deleted' };

    if (user.isBlocked) {
        throw { status: 403, message: 'Your account has been blocked. Please contact support for assistance.' };
    }

    if (!user.password) {
        throw {
            status: 400,
            message: 'This account was created with social login. Please contact support to delete your account.',
        };
    }

    const isMatch = await compare(password, user.password);
    if (!isMatch) throw { status: 400, message: 'Invalid email or password' };

    user.isDeleted = true;
    user.deletedAt = clock.now();
    user.deletedBy = 'user';
    await user.save();

    return {};
}

module.exports = deleteAccountPublic;
