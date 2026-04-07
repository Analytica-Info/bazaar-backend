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

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;
