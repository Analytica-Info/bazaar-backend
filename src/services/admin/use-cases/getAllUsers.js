'use strict';

const mongoose = require('mongoose');
const User     = require('../../../repositories').users.rawModel();
const Order    = require('../../../repositories').orders.rawModel();
const { escapeRegex } = require('../../../utilities/stringUtils');
const { enrichOrdersWithDetails } = require('../domain/enrichOrders');

module.exports = async function getAllUsers({ page, limit, search, status, platform, authProvider, startDate, endDate }) {
    page  = parseInt(page)  || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;

    const searchQuery       = search       || '';
    const statusFilter      = status       || '';
    const platformFilter    = platform     || '';
    const authProviderFilter = authProvider || '';
    const dateFrom          = startDate    || '';
    const dateTo            = endDate      || '';

    const query = {};

    if (searchQuery) {
        const safeQuery = escapeRegex(searchQuery);
        query.$or = [
            { name:  { $regex: safeQuery, $options: 'i' } },
            { email: { $regex: safeQuery, $options: 'i' } },
            { phone: { $regex: safeQuery, $options: 'i' } }
        ];
    }

    if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'active') {
            query.isDeleted = false;
            query.isBlocked = false;
        } else if (statusFilter === 'blocked') {
            query.isDeleted = false;
            query.isBlocked = true;
        } else if (statusFilter === 'deleted') {
            query.isDeleted = true;
        }
    }

    if (platformFilter && platformFilter !== 'all') {
        const pf = platformFilter.toLowerCase();
        if (pf === 'web') {
            query.platform = { $regex: /^(web|website)$/i };
        } else {
            query.platform = { $regex: new RegExp(`^${platformFilter}$`, 'i') };
        }
    }

    if (authProviderFilter && authProviderFilter !== 'all') {
        query.authProvider = { $regex: new RegExp(`^${authProviderFilter}$`, 'i') };
    }

    if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            query.createdAt.$gte = from;
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query.createdAt.$lte = to;
        }
    }

    const users = await User.find(query)
        .select('-password -resetPasswordToken -resetPasswordExpires -refreshToken -recoveryCode -recoveryCodeExpires')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec();

    const totalCount = await User.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    const userIds = users.map(u => new mongoose.Types.ObjectId(u._id));
    const allOrders = await Order.find({ $or: [{ userId: { $in: userIds } }, { user_id: { $in: userIds } }] })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

    const enrichedOrders = await enrichOrdersWithDetails(allOrders);

    const ordersByUserId = {};
    for (const order of enrichedOrders) {
        const key = (order.userId || order.user_id)?.toString();
        if (!key) continue;
        if (!ordersByUserId[key]) ordersByUserId[key] = [];
        ordersByUserId[key].push(order);
    }

    const usersWithOrders = users.map(user => {
        const userObj = user.toObject();
        const ordersWithDetails = ordersByUserId[user._id.toString()] || [];
        const platformFromOrder = ordersWithDetails[0]?.orderfrom;
        return {
            ...userObj,
            platform: userObj.platform || platformFromOrder || null,
            orders: ordersWithDetails,
            totalOrders: ordersWithDetails.length,
        };
    });

    return {
        users: usersWithOrders,
        pagination: {
            currentPage: page,
            totalPages,
            totalUsers: totalCount,
            usersPerPage: limit,
        },
    };
};
