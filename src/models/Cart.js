const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    quantity: {
        type: Number,
        default: 1,
    },
    product_type_id: { type: String },
    image: { type: String, required: true },
    name: { type: String, required: true },
    originalPrice: { type: String, required: true },
    productId: { type: String, required: true },
    totalAvailableQty: { type: String, required: true },
    variantId: { type: String, required: true },
    variantName: { type: String, required: true },
    variantPrice: { type: String, required: true },
});

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        unique: true,
    },
    items: [cartItemSchema],
}, {
    timestamps: true,
});


const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;