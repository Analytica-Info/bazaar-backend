'use strict';

const clock = require('../../../utilities/clock');
const { User } = require('./_shared');

async function deleteAccount(userId, platform = 'web') {
    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found' };
    if (user.isDeleted) throw { status: 400, message: 'Account already deleted' };

    user.isDeleted = true;
    user.deletedAt = clock.now();
    if (platform === 'web') user.deletedBy = 'user';
    await user.save();

    return {};
}

module.exports = deleteAccount;
