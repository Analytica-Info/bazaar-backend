'use strict';

const mongoose = require('mongoose');
const User     = require('../../../repositories').users.rawModel();

module.exports = async function updateUser(userId, data) {
    const { name, email, phone } = data;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found.' };

    if (user.isDeleted) {
        throw { status: 400, message: 'Cannot update a deleted user. Please restore the user first.' };
    }

    if (email && email !== user.email) {
        const existingUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingUser) {
            throw { status: 400, message: 'Email already exists for another user.' };
        }
        user.email = email;
    }

    if (name  !== undefined) user.name  = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    return {
        _id:       user._id,
        name:      user.name,
        email:     user.email,
        phone:     user.phone,
        isBlocked: user.isBlocked || false,
        isDeleted: user.isDeleted
    };
};
