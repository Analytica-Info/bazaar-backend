const RecommendationEvent = require('../models/RecommendationEvent');
const BaseRepository = require('./BaseRepository');

class RecommendationEventRepository extends BaseRepository {
    constructor() { super(RecommendationEvent); }

    /**
     * Fire-and-forget batch insert. Errors are swallowed at the service layer
     * since rec event logging must never block a request.
     */
    async logBatch(events) {
        if (!events || !events.length) return { inserted: 0 };
        const docs = await this.model.insertMany(events, { ordered: false });
        return { inserted: docs.length };
    }
}

module.exports = RecommendationEventRepository;
