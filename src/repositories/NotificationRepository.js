/**
 * NotificationRepository — owns all Mongoose access for the Notification model.
 * No business logic. Methods are named for caller intent, not Mongoose verbs.
 */
const Notification = require('../models/Notification');
const BaseRepository = require('./BaseRepository');

class NotificationRepository extends BaseRepository {
    constructor() {
        super(Notification);
    }

    /**
     * Hydrated find by id (caller mutates and `.save()`s).
     * @param {string} id
     * @param {{ session?: any }} [opts]
     */
    findByIdAsDocument(id, opts = {}) {
        return this.findById(id, { ...opts, lean: false });
    }

    /**
     * Hydrated find by id with `createdBy` populated for admin views.
     */
    findByIdWithCreator(id) {
        return this.model.findById(id)
            .populate('createdBy', 'firstName lastName email')
            .exec();
    }

    /**
     * Paginated list of admin-created notifications, with creator populated.
     * @param {{ page: number, limit: number }} opts
     * @returns {Promise<{ items: Array, total: number }>}
     */
    async listAdminNotificationsPaginated({ page, limit }) {
        const skip = (page - 1) * limit;
        const filter = { createdBy: { $exists: true, $ne: null } };
        const [items, total] = await Promise.all([
            this.model.find(filter)
                .populate('createdBy', 'firstName lastName email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            this.model.countDocuments(filter),
        ]);
        return { items, total };
    }

    /**
     * Per-user notifications. When `paginate` is false, returns the full set.
     * @param {string|import('mongoose').Types.ObjectId} userId
     * @param {{ paginate: boolean, page?: number, limit?: number }} opts
     */
    async listForUser(userId, { paginate, page = 1, limit = 20 }) {
        const filter = { userId };
        const cursor = this.model.find(filter).sort({ createdAt: -1 });
        if (paginate) cursor.skip((page - 1) * limit).limit(limit);

        const [items, total, unreadCount] = await Promise.all([
            cursor.lean().exec(),
            this.model.countDocuments(filter),
            this.model.countDocuments({ ...filter, read: { $ne: true } }),
        ]);
        return { items, total, unreadCount };
    }

    /**
     * Mark a set of user notifications read (scoped to that user).
     */
    markReadForUser(userId, ids, opts = {}) {
        return this.updateMany(
            { _id: { $in: ids }, userId },
            { $set: { read: true } },
            opts
        );
    }
}

module.exports = NotificationRepository;
