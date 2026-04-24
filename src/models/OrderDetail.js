const mongoose = require('mongoose');

const orderDetailSchema = new mongoose.Schema({
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    product_id: String,
    product_name: String,
    product_image: String,
    variant_name: String,
    amount: Number,
    quantity: Number
}, {
    timestamps: true,
    strict: false,
});

// order_id lookup is the primary access pattern for order detail pages,
// admin order views, and smartCategoriesService aggregations (sold products).
orderDetailSchema.index({ order_id: 1 });
// createdAt lookup used for trending products aggregation
orderDetailSchema.index({ createdAt: -1 });

const OrderDetail = mongoose.model('OrderDetail', orderDetailSchema);
module.exports = OrderDetail;
