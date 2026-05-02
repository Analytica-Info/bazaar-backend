const mongoose = require('mongoose');

/**
 * Event log for recommendation surfaces.
 *
 * Distinct from ProductView (which is a per-user counter for product detail
 * visits). This collection captures rec-slot interactions so we can attribute
 * impressions, clicks, add-to-cart, and purchase to the rec source that
 * surfaced the product. Required for A/B evaluation in Phase 4.
 *
 * Keep schema cheap — this collection grows fast.
 */
const REC_EVENT_TYPES = ['impression', 'click', 'add_to_cart', 'purchase'];
const REC_SOURCES = [
    'trending',
    'similar',
    'frequently_bought',
    'for_you',
    'post_purchase',
    'search_rerank',
];

const recommendationEventSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        sessionId: { type: String, default: null },
        productId: { type: String, required: true, index: true },
        eventType: { type: String, enum: REC_EVENT_TYPES, required: true },
        recSource: { type: String, enum: REC_SOURCES, required: true },
        recId: { type: String, default: null },
        anchorProductId: { type: String, default: null },
        position: { type: Number, default: null },
        platform: { type: String, default: null },
        experimentVariant: { type: String, default: null },
    },
    { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

recommendationEventSchema.index({ recSource: 1, createdAt: -1 });
recommendationEventSchema.index({ recId: 1 });
recommendationEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RecommendationEvent', recommendationEventSchema);
module.exports.REC_EVENT_TYPES = REC_EVENT_TYPES;
module.exports.REC_SOURCES = REC_SOURCES;
