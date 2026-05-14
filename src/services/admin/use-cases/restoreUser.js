'use strict';

const mongoose = require('mongoose');
const User     = require('../../../repositories').users.rawModel();

module.exports = async function restoreUser(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found.' };

    if (!user.isDeleted) {
        throw { status: 400, message: 'User is not deleted.' };
    }

    user.isDeleted = false;
    user.deletedAt = null;
    user.deletedBy = null;
    await user.save();

    return { _id: user._id, name: user.name, email: user.email, isDeleted: user.isDeleted };
};
