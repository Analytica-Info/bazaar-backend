const mongoose = require('mongoose');

const orderDetailSchema = new mongoose.Schema({
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    product_id: String,
    product_name: String,
    product_image: String,
    variant_name: String,
    amount: Number,
    quantity: Number,
    isGiftWithPurchase: { type: Boolean, default: false },
    nonReturnable: { type: Boolean, default: false },
}, {
    timestamps: true
});

const OrderDetail = mongoose.model('OrderDetail', orderDetailSchema);
module.exports = OrderDetail;
