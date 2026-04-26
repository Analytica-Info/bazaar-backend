const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nickname: String,
    summary: String,
    texttext: String,
    image: String,
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quality_rating: Number,
    value_rating: Number,
    price_rating: Number,
}, { 
    timestamps: true
});

// Product detail page fetches all reviews for a product
reviewSchema.index({ product_id: 1 });
// Duplicate-review check ("has this user reviewed this product?")
reviewSchema.index({ user_id: 1, product_id: 1 });
// Standalone user_id — used by getUserReviews aggregation which filters only by user.
reviewSchema.index({ user_id: 1 });

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;
