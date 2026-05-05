const Product = require('../models/Product');
const BaseRepository = require('./BaseRepository');

class ProductRepository extends BaseRepository {
    constructor() {
        super(Product);
    }

    /** Lean fetch of products by ids with a custom projection. */
    findByIdsLean(ids, projection) {
        if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve([]);
        const q = this.model.find({ _id: { $in: ids } });
        if (projection) q.select(projection);
        return q.lean().exec();
    }

    /** SKU lookup map for a list of products — used by orders/payment-history. */
    async findSkuMap(productIds) {
        if (!Array.isArray(productIds) || productIds.length === 0) return {};
        const products = await this.model.find({ _id: { $in: productIds } })
            .select('product.sku_number')
            .lean();
        const map = {};
        for (const p of products) map[String(p._id)] = p.product?.sku_number || null;
        return map;
    }

    /**
     * Find products by ids, hydrated. Used where service-layer logic needs
     * Mongoose docs (populate chains, etc.).
     */
    findByIds(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve([]);
        return this.model.find({ _id: { $in: ids } }).exec();
    }

    /**
     * Lean fetch of products by ids, excluding heavy fields used by reviews UI.
     */
    findByIdsForReviews(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return Promise.resolve([]);
        return this.model.find({ _id: { $in: ids } })
            .select('-product.variants -product.product_codes -product.suppliers -product.composite_bom -product.tag_ids -product.attributes -product.account_code_sales -product.account_code_purchase -product.price_outlet -product.brand_id -product.deleted_at -product.version -product.created_at -product.updated_at -webhook -webhookTime -__v')
            .lean();
    }
}

module.exports = ProductRepository;
