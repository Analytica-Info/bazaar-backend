'use strict';

const BaseRepository = require('./BaseRepository');
const PaymentMethodConfig = require('../models/PaymentMethodConfig');

const SINGLETON_ID = 'singleton';

const DEFAULTS = {
    _id: SINGLETON_ID,
    stripeEnabled: true,
    tabbyEnabled: true,
    nomodEnabled: false,
    updatedBy: 'system',
    updatedAt: null,
};

class PaymentMethodConfigRepository extends BaseRepository {
    constructor() {
        super(PaymentMethodConfig);
    }

    /**
     * Return the singleton config document.
     * Auto-creates it with defaults if it does not yet exist (lazy init).
     * @returns {Promise<object>}
     */
    async getSingleton() {
        let doc = await this.findById(SINGLETON_ID);
        if (!doc) {
            doc = await this.model.findOneAndUpdate(
                { _id: SINGLETON_ID },
                { $setOnInsert: DEFAULTS },
                { upsert: true, new: true, lean: true, setDefaultsOnInsert: true }
            ).lean().exec();
        }
        return doc;
    }

    /**
     * Partially update the singleton config.
     * Only the fields present in `patch` are modified.
     * @param {Partial<{stripeEnabled: boolean, tabbyEnabled: boolean, nomodEnabled: boolean}>} patch
     * @param {object} opts
     * @param {Date}   opts.updatedAt
     * @param {string} opts.updatedBy
     * @returns {Promise<object>}
     */
    async updateSingleton(patch, { updatedAt, updatedBy }) {
        const update = { ...patch, updatedAt, updatedBy };
        const doc = await this.model.findOneAndUpdate(
            { _id: SINGLETON_ID },
            { $set: update },
            { upsert: true, new: true, lean: true, setDefaultsOnInsert: true }
        ).lean().exec();
        return doc;
    }
}

module.exports = PaymentMethodConfigRepository;
