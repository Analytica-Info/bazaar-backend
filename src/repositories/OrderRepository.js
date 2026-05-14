/**
 * OrderRepository — owns Mongoose access for the Order model.
 *
 * **CRITICAL**: this repository centralizes the dual-schema reconciliation
 * between `userId` (newer) and `user_id` (legacy). All ownership lookups go
 * through `byUser(userId)`. Service-layer code must not construct that filter
 * directly — call repo methods instead.
 *
 * Surface intentionally limited to what currently-migrated services need.
 * Add methods as further services migrate (Phase 5 will expand significantly
 * for checkout/orderService).
 */
const mongoose = require('mongoose');
const Order = require('../models/Order');
const BaseRepository = require('./BaseRepository');

/** Returns the canonical $or filter to match either ownership field. */
function ownershipFilter(userId) {
    const oid = new mongoose.Types.ObjectId(userId);
    return { $or: [{ userId: oid }, { user_id: oid }] };
}

class OrderRepository extends BaseRepository {
    constructor() {
        super(Order);
    }

    /**
     * Find user's orders. Hydrated docs by default (consumers reduce/transform).
     * @param {string|import('mongoose').Types.ObjectId} userId
     * @param {{ page?: number, limit?: number, lean?: boolean }} [opts]
     */
    async findForUser(userId, { page, limit, lean = false } = {}) {
        let cursor = this.model.find(ownershipFilter(userId)).sort({ createdAt: -1 });
        if (page !== undefined || limit !== undefined) {
            const p = Math.max(1, Number(page) || 1);
            const l = Math.min(100, Math.max(1, Number(limit) || 20));
            cursor = cursor.skip((p - 1) * l).limit(l);
        }
        if (lean) cursor = cursor.lean();
        return cursor.exec();
    }

    /**
     * Find a specific order owned by the user.
     */
    findOneForUser(userId, orderId, { lean = false } = {}) {
        const q = this.model.find({
            _id: orderId,
            ...ownershipFilter(userId),
        });
        return lean ? q.lean().exec() : q.exec();
    }

    /**
     * Count orders for a user (de-duplicated via $or).
     */
    countForUser(userId) {
        return this.model.countDocuments(ownershipFilter(userId));
    }

    /**
     * Tabby-history specific: legacy `user_id` only, recent 10, projected.
     */
    findRecentForTabbyHistory(userId, { limit = 10 } = {}) {
        return this.model.find({ user_id: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('order_id order_no order_datetime amount_total status payment_status payment_method createdAt name email phone address state')
            .lean()
            .exec();
    }

    /**
     * Tabby-history specific: count successful orders by legacy user_id.
     */
    countSuccessfulOrders(userId) {
        return this.model.countDocuments({
            user_id: userId,
            payment_status: { $nin: ['pending', 'failed', 'cancelled', 'refunded', 'expired'] },
        });
    }

    /**
     * Orders created within a date range (used by analytics/dashboards).
     */
    findByDateRange(start, end) {
        return this.model.find({ createdAt: { $gte: start, $lte: end } }).exec();
    }
}

module.exports = OrderRepository;
module.exports.ownershipFilter = ownershipFilter;
