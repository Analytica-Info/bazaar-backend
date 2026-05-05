'use strict';

const mongoose = require('mongoose');
const User     = require('../../../repositories').users.rawModel();

module.exports = async function unblockUser(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found.' };

    if (!user.isBlocked) {
        throw { status: 400, message: 'User is not blocked.' };
    }

    user.isBlocked = false;
    user.blockedAt = null;
    await user.save();

    return { _id: user._id, name: user.name, email: user.email, isBlocked: user.isBlocked };
};
