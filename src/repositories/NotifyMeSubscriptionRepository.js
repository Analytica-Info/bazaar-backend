'use strict';

const NotifyMeSubscription = require('../models/NotifyMeSubscription');
const BaseRepository = require('./BaseRepository');
const clock = require('../utilities/clock');

class NotifyMeSubscriptionRepository extends BaseRepository {
    constructor() {
        super(NotifyMeSubscription);
    }

    /**
     * Find a subscription by email + vertical.
     * @param {string} email  Already normalised to lowercase.
     * @param {string} vertical
     * @param {{ lean?: boolean }} [opts]
     */
    findByEmailAndVertical(email, vertical, opts = {}) {
        return this.findOne({ email, vertical }, opts);
    }

    /**
     * Upsert a subscription.  Returns { doc, created }.
     * @param {string} email   Normalised (lowercase) email.
     * @param {string} vertical
     * @param {{ pushOptIn?: boolean, deviceId?: string }} [fields]
     */
    async upsert(email, vertical, fields = {}) {
        const filter = { email, vertical };
        const update = {
            $setOnInsert: { email, vertical },
            $set: {
                ...(fields.pushOptIn !== undefined ? { pushOptIn: fields.pushOptIn } : {}),
                ...(fields.deviceId ? { deviceId: fields.deviceId } : {}),
            },
        };
        const result = await this.model.findOneAndUpdate(filter, update, {
            upsert: true,
            new: false,
            lean: true,
            includeResultMetadata: true,
        });
        const created = result?.lastErrorObject?.upserted != null;
        return { doc: result?.value || null, created };
    }

    /**
     * Mark all subscriptions for a vertical as notified.
     * @param {string} vertical
     * @param {Date} [at]
     */
    markNotified(vertical, at = clock.now()) {
        return this.model
            .updateMany({ vertical, notifiedAt: null }, { $set: { notifiedAt: at } })
            .lean()
            .exec();
    }

    /**
     * Find all push-opt-in subscriptions for a vertical that have not yet been notified.
     * @param {string} vertical
     */
    findPushSubscribers(vertical) {
        return this.find({ vertical, pushOptIn: true, notifiedAt: null });
    }

    /**
     * Find all subscriptions for a vertical that have not yet been notified.
     * @param {string} vertical
     */
    findAllSubscribers(vertical) {
        return this.find({ vertical, notifiedAt: null });
    }
}

module.exports = NotifyMeSubscriptionRepository;
