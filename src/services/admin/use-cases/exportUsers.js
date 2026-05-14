'use strict';

const User = require('../../../repositories').users.rawModel();
const { escapeRegex } = require('../../../utilities/stringUtils');

module.exports = async function exportUsers(filters) {
    const searchQuery       = filters.search       || '';
    const statusFilter      = filters.status       || '';
    const platformFilter    = filters.platform     || '';
    const authProviderFilter = filters.authProvider || '';
    const dateFrom          = filters.startDate    || '';
    const dateTo            = filters.endDate      || '';

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
        .select('name phone email role authProvider platform isDeleted isBlocked createdAt')
        .sort({ createdAt: -1 })
        .lean()
        .exec();

    return users;
};
