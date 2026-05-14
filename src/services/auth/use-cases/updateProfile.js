'use strict';

const { User, Coupon } = require('./_shared');

async function updateProfile(userId, { name, email, phone, username }, avatarUrl) {
    if (!name) throw { status: 400, message: 'Name is required' };
    if (!email) throw { status: 400, message: 'Email is required' };
    if (!phone) throw { status: 400, message: 'Phone is required' };

    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found' };

    if (email !== user.email) {
        const existingEmailUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingEmailUser) throw { status: 400, message: 'Email already exists in another user' };
    }

    if (phone !== user.phone) {
        const existingUser = await User.findOne({ phone, _id: { $ne: userId } });
        if (existingUser) throw { status: 400, message: 'Phone already exists in another user' };

        const phoneInCoupon = await Coupon.findOne({ phone });
        if (phoneInCoupon) throw { status: 400, message: 'Phone already exists in another user' };
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (username) user.username = username;
    if (avatarUrl) user.avatar = avatarUrl;
    await user.save();

    return { user };
}

module.exports = updateProfile;
