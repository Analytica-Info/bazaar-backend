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

// order_id lookup is the primary access pattern for order detail pages and admin order views.
orderDetailSchema.index({ order_id: 1 });
// product_id lookup — joining order details to products for SKU/category info.
orderDetailSchema.index({ product_id: 1 });
// createdAt — smartCategoriesService trending/today-deal aggregations filter by time window.
orderDetailSchema.index({ createdAt: -1 });

const OrderDetail = mongoose.model('OrderDetail', orderDetailSchema);
module.exports = OrderDetail;
