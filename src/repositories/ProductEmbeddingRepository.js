const ProductEmbedding = require('../models/ProductEmbedding');
const BaseRepository = require('./BaseRepository');

class ProductEmbeddingRepository extends BaseRepository {
    constructor() { super(ProductEmbedding); }

    findByProductId(productId) {
        return this.model.findOne({ productId }).lean();
    }

    upsert(doc) {
        return this.model.updateOne(
            { productId: doc.productId },
            { $set: doc },
            { upsert: true }
        );
    }

    /**
     * Atlas Vector Search kNN. Requires a vector index configured in Atlas.
     * Returns [] if the index is missing.
     */
    async vectorSearch(queryVector, { limit = 10, category, excludeIds = [] } = {}) {
        const filter = {};
        if (category) filter.category = category;
        if (excludeIds.length) filter.productId = { $nin: excludeIds };
        try {
            return await this.model
                .aggregate([
                    {
                        $vectorSearch: {
                            index: 'product_embedding_idx',
                            path: 'embedding',
                            queryVector,
                            numCandidates: limit * 20,
                            limit,
                            filter,
                        },
                    },
                    { $project: { productId: 1, score: { $meta: 'vectorSearchScore' } } },
                ])
                .exec();
        } catch (_err) {
            return [];
        }
    }
}

module.exports = ProductEmbeddingRepository;
