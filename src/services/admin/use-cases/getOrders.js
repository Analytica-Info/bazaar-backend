'use strict';

const Order = require('../../../repositories').orders.rawModel();
const { enrichOrdersWithDetails } = require('../domain/enrichOrders');

module.exports = async function getOrders({ page, limit, search, status, paymentStatus, paymentMethod, platform, startDate, endDate }) {
    page  = parseInt(page)  || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;

    const orderIdSearch      = search        || '';
    const dateFrom           = startDate     || '';
    const dateTo             = endDate       || '';
    const statusFilter       = status        || '';
    const paymentStatusFilter = paymentStatus || '';
    const paymentMethodFilter = paymentMethod || '';
    const platformFilter     = platform      || '';

    const query = {};

    if (orderIdSearch) {
        query.order_id = { $regex: orderIdSearch, $options: 'i' };
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

    if (statusFilter && statusFilter !== 'all') {
        query.status = { $regex: new RegExp(`^${statusFilter}$`, 'i') };
    }

    if (paymentStatusFilter && paymentStatusFilter !== 'all') {
        query.payment_status = { $regex: new RegExp(`^${paymentStatusFilter}$`, 'i') };
    }

    if (paymentMethodFilter && paymentMethodFilter !== 'all') {
        const pm = paymentMethodFilter.toLowerCase();
        if (pm === 'stripe') {
            query.payment_method = { $regex: /^(card|stripe)$/i };
        } else {
            query.payment_method = { $regex: new RegExp(`^${paymentMethodFilter}$`, 'i') };
        }
    }

    if (platformFilter && platformFilter !== 'all') {
        const pf = platformFilter.toLowerCase();
        if (pf === 'website') {
            query.orderfrom = { $regex: /^website$/i };
        } else if (pf === 'mobileapp' || pf === 'mobile app') {
            query.orderfrom = { $regex: /^(mobile\s*app|mobileapp)$/i };
        } else {
            query.orderfrom = { $regex: new RegExp(`^${platformFilter}$`, 'i') };
        }
    }

    const [rawOrders, totalCount] = await Promise.all([
        Order.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }).lean().exec(),
        Order.countDocuments(query),
    ]);
    const totalPages    = Math.ceil(totalCount / limit);
    const updatedOrders = await enrichOrdersWithDetails(rawOrders);

    return {
        orders: updatedOrders,
        pagination: {
            currentPage:  page,
            totalPages,
            totalOrders:  totalCount,
            ordersPerPage: limit,
        },
    };
};
