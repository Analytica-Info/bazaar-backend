/**
 * UserRepository — owns all Mongoose access for the User model.
 *
 * Surface intentionally limited at this stage to what notificationService
 * needs. Additional methods will be added as further services migrate.
 */
const User = require('../models/User');
const BaseRepository = require('./BaseRepository');

class UserRepository extends BaseRepository {
    constructor() {
        super(User);
    }

    /**
     * Verify a list of user ids all exist.
     * @returns {Promise<boolean>}
     */
    async allExist(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return true;
        const count = await this.model.countDocuments({ _id: { $in: ids } });
        return count === ids.length;
    }

    /** Total user count. */
    countAll() {
        return this.model.countDocuments();
    }

    /**
     * Lean fetch of users by ids, capped — for notification recipient sampling.
     */
    findByIdsCapped(ids, { limit = 500, projection = 'name email phone' } = {}) {
        if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve([]);
        return this.model.find({ _id: { $in: ids } })
            .select(projection)
            .limit(limit)
            .lean()
            .exec();
    }

    /**
     * Lean fetch of users NOT in `excludeIds`, capped.
     */
    findExcludingIdsCapped(excludeIds, { limit = 500, projection = 'name email phone' } = {}) {
        return this.model.find({ _id: { $nin: excludeIds } })
            .select(projection)
            .limit(limit)
            .lean()
            .exec();
    }

    /**
     * Search users by name/email/phone with pagination.
     * Caller must pass an already-escaped regex string.
     */
    async searchPaginated({ regexSafe, page, limit }) {
        const filter = {};
        if (regexSafe) {
            filter.$or = [
                { name: { $regex: regexSafe, $options: 'i' } },
                { email: { $regex: regexSafe, $options: 'i' } },
                { phone: { $regex: regexSafe, $options: 'i' } },
            ];
        }
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            this.model.find(filter)
                .select('name email phone fcmToken')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .exec(),
            this.model.countDocuments(filter),
        ]);
        return { items, total };
    }

    /**
     * Lightweight profile projection for v2 user/profile screens.
     */
    findProfileFields(userId) {
        return this.model.findById(userId)
            .select('_id name first_name email username avatar role phone authProvider createdAt')
            .lean();
    }

    /**
     * All users sorted by name, capped — for the notification targeting picker.
     */
    listForNotificationTargeting({ limit = 1000 } = {}) {
        return this.model.find()
            .select('name email phone fcmToken')
            .sort({ name: 1 })
            .limit(limit)
            .lean()
            .exec();
    }
}

module.exports = UserRepository;
