'use strict';

const { getCouponStatus, User, Order } = require('./_shared');

async function getUserData(userId, platform = 'mobile') {
    const user = await User.findById(userId);
    if (!user) throw { status: 404, message: 'User not found' };

    if (user.isDeleted) {
        const message = user.deletedBy === 'admin'
            ? 'Your account has been deleted by an administrator. Please contact support for assistance.'
            : 'Your account has been deleted. Please register again.';
        throw { status: 403, message };
    }

    if (user.isBlocked) {
        throw { status: 403, message: 'Your account has been blocked. Please contact support for assistance.' };
    }

    const coupon = await getCouponStatus(user.phone, platform === 'mobile' ? 'mobile' : 'web');
    const totalOrderCount = await Order.countDocuments({ user_id: user._id });

    return {
        data: {
            name: user.name,
            email: user.email,
            avatar: user.avatar || '',
            role: user.role,
            phone: user.phone,
            provider: user.authProvider,
        },
        coupon,
        totalOrderCount,
        usedFirst15Coupon: user.usedFirst15Coupon || false,
    };
}

module.exports = getUserData;
