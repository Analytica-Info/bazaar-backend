'use strict';

const mongoose  = require('mongoose');
const User      = require('../../../repositories').users.rawModel();
const Order     = require('../../../repositories').orders.rawModel();
const Cart      = require('../../../repositories').carts.rawModel();
const Wishlist  = require('../../../repositories').wishlists.rawModel();
const { enrichOrdersWithDetails } = require('../domain/enrichOrders');

module.exports = async function getUserById(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw { status: 400, message: 'Invalid user ID format.' };
    }

    const user = await User.findById(userId)
        .select('-password -resetPasswordToken -resetPasswordExpires -refreshToken -recoveryCode -recoveryCodeExpires')
        .exec();

    if (!user) throw { status: 404, message: 'User not found.' };

    const userIdObj = new mongoose.Types.ObjectId(user._id);

    const rawOrders = await Order.find({ $or: [{ user_id: userIdObj }, { userId: userIdObj }] })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

    const ordersWithDetails = await enrichOrdersWithDetails(rawOrders);

    const cart = await Cart.findOne({ user: userId })
        .populate('items.product', 'product.name product.images discountedPrice originalPrice discount')
        .lean();

    const wishlist = await Wishlist.findOne({ user: userId })
        .populate('items')
        .lean();

    return {
        ...user.toObject(),
        cart:        cart     ? cart.items     : [],
        wishlist:    wishlist ? wishlist.items  : [],
        orders:      ordersWithDetails,
        totalOrders: ordersWithDetails.length
    };
};
