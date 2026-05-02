const Review = require('../models/Review');
const BaseRepository = require('./BaseRepository');

class ReviewRepository extends BaseRepository {
    constructor() {
        super(Review);
    }

    findOneForUserAndProduct(userId, productId) {
        return this.model.findOne({ user_id: userId, product_id: productId });
    }

    findForUserByProducts(userId, productIds) {
        return this.model.find({ user_id: userId, product_id: { $in: productIds } });
    }

    /**
     * Lean fetch of every review with the projection clients use.
     * NOTE: returns the full collection; callers should consider pagination.
     */
    listAllProjected() {
        return this.model.find()
            .select('nickname summary texttext image product_id quality_rating value_rating price_rating user_id createdAt updatedAt')
            .lean();
    }
}

module.exports = ReviewRepository;
