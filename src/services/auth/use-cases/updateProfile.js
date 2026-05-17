'use strict';

const { User } = require('./_shared');

async function updateProfile(userId, { name, email, phone, username }, avatarUrl) {
    if (!name) throw { status: 400, message: 'Name is required' };
    if (!email) throw { status: 400, message: 'Email is required' };
    if (!phone) throw { status: 400, message: 'Phone is required' };

    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found' };

    if (email !== user.email) {
        const existingEmailUser = await User.findOne({ email, _id: { $ne: userId } });
        if (existingEmailUser) throw { status: 400, message: 'This email is already linked to another account.' };
    }

    // Phone uniqueness against User collection only. The earlier check against the
    // Coupon collection was misplaced — it caused legitimate updates (social-login
    // users adding their phone, users changing to a phone that was ever issued a
    // promotional coupon) to fail. The Coupon-phone check is correctly enforced in
    // signup.js for its real intent: preventing one-per-phone signup-coupon gaming.
    const oldPhone = user.phone;
    if (phone !== oldPhone) {
        const existingUser = await User.findOne({ phone, _id: { $ne: userId } });
        if (existingUser) throw { status: 400, message: 'This phone number is already linked to another account.' };

        // Cascade: addresses whose delivery contact was identical to the user's old
        // profile phone get updated to the new phone. Addresses that the user set to
        // a *different* delivery contact (e.g. shipping to a family member's number)
        // are intentionally left untouched — that's a deliberate per-address override.
        if (oldPhone && Array.isArray(user.address)) {
            for (const addr of user.address) {
                if (addr.mobile === oldPhone) addr.mobile = phone;
            }
        }
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
