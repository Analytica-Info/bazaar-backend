const mongoose = require('mongoose');

/**
 * Precomputed product co-purchase scores.
 *
 * Populated nightly by `services/recommendations/coPurchaseJob.js`.
 * (a, b) is stored canonically with a < b lexicographically. Lookups for a
 * given product must query both `a` and `b`.
 *
 * `score` is the lift / observed-vs-expected ratio; higher = stronger pair.
 */
const coPurchasePairSchema = new mongoose.Schema(
    {
        a: { type: String, required: true, index: true },
        b: { type: String, required: true, index: true },
        coCount: { type: Number, required: true },
        score: { type: Number, required: true },
        computedAt: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

coPurchasePairSchema.index({ a: 1, score: -1 });
coPurchasePairSchema.index({ b: 1, score: -1 });
coPurchasePairSchema.index({ a: 1, b: 1 }, { unique: true });

module.exports = mongoose.model('CoPurchasePair', coPurchasePairSchema);
