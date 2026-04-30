const mongoose = require('mongoose');

/**
 * Phase 2 — content embeddings for products.
 *
 * Stored in a separate collection (rather than on Product) so the embedding
 * pipeline can churn without touching the hot product document.
 *
 * To enable kNN search at the database tier, create a Mongo Atlas Vector
 * Search index named `product_embedding_idx` over `embedding` with
 * `numDimensions: 1536` (matches text-embedding-3-small) and `similarity:
 * cosine`. If the index is not present, the service falls back to in-memory
 * cosine over a candidate set restricted by category.
 *
 * `contentHash` is sha256 of the source text — re-embed only when it changes.
 */
const productEmbeddingSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
            unique: true,
        },
        model: { type: String, required: true },
        embedding: { type: [Number], required: true },
        contentHash: { type: String, required: true },
        category: { type: String, default: null, index: true },
        embeddedAt: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

module.exports = mongoose.model('ProductEmbedding', productEmbeddingSchema);
