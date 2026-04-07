const mongoose = require('mongoose');

const productViewSchema = new mongoose.Schema({
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        default: null
    },
    views: {
        type: Number,
        default: 1
    },
    lastViewedAt: {
        type: Date,
        default: Date.now
    }
});

productViewSchema.index({ product_id: 1, user_id: 1 }, { unique: true });

const ProductView = mongoose.model('ProductView', productViewSchema);

module.exports = ProductView;

