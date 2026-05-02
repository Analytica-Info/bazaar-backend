const mongoose = require('mongoose');

/**
 * Phase 4 — feature flag / A-B experiment registry.
 *
 * One document per experiment (e.g. "for_you_als_v1"). Variants are weighted;
 * the assignment middleware hashes (userId|sessionId, key) into [0,1) and
 * picks the variant whose cumulative weight covers the bucket.
 *
 * `recommendationEvents.experimentVariant` records the variant a user saw,
 * which lets the metrics aggregator compute lift per variant.
 */
const variantSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        weight: { type: Number, required: true, min: 0, max: 1 },
        config: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { _id: false }
);

const experimentSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        description: { type: String, default: '' },
        status: {
            type: String,
            enum: ['draft', 'running', 'paused', 'completed'],
            default: 'draft',
        },
        variants: { type: [variantSchema], required: true },
        startedAt: { type: Date, default: null },
        endedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Experiment', experimentSchema);
