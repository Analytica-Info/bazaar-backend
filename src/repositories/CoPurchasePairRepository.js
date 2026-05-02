const CoPurchasePair = require('../models/CoPurchasePair');
const BaseRepository = require('./BaseRepository');

class CoPurchasePairRepository extends BaseRepository {
    constructor() { super(CoPurchasePair); }

    /**
     * Top co-purchase partners for a product.
     * @param {string} productId
     * @param {number} limit
     * @returns {Promise<Array<{ partnerId: string, score: number, coCount: number }>>}
     */
    async topPartners(productId, limit = 10) {
        const docs = await this.model
            .find({ $or: [{ a: productId }, { b: productId }] })
            .sort({ score: -1 })
            .limit(limit)
            .lean();
        return docs.map((d) => ({
            partnerId: d.a === productId ? d.b : d.a,
            score: d.score,
            coCount: d.coCount,
        }));
    }

    async bulkReplace(pairs) {
        if (!pairs.length) return { upserted: 0 };
        const ops = pairs.map((p) => ({
            updateOne: {
                filter: { a: p.a, b: p.b },
                update: { $set: p },
                upsert: true,
            },
        }));
        const res = await this.model.bulkWrite(ops, { ordered: false });
        return { upserted: res.upsertedCount + res.modifiedCount };
    }
}

module.exports = CoPurchasePairRepository;
