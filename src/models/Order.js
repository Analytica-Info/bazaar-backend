const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        order_id: { type: String, unique: true }, // Unique professional order ID
        order_no: { type: Number, unique: true }, // Sequential order number
        order_datetime: { type: String },
        name: { type: String, required: true },
        phone: { type: String, default: '-' },
        country: { type: String, default: 'AE' },
        currency: { type: String, default: 'AED' },
        state: { type: String, default: '-' },
        address: { type: String, required: true },
        city: { type: String, default: '-' },
        area: { type: String, default: '-' },
        buildingName: { type: String, default: '-' },
        floorNo: { type: String, default: '-' },
        apartmentNo: { type: String, default: '-' },
        landmark: { type: String, default: '-' },
        email: { type: String, required: true },
        status: { type: String, required: true },
        amount_subtotal: { type: String, required: true },
        amount_total: { type: String, required: true },
        discount_amount: { type: String, required: true },
        saved_total: { type: String },
        shipping: { type: Number, default: 0 },
        txn_id: { type: String, required: true },
        payment_method: { type: String, required: true },
        payment_status: { type: String, required: true },
        checkout_session_id: { type: String, required: false },
        orderfrom: { type: String, default: '-' },
        orderTracks: [
            {
                status: { type: String, required: true },
                dateTime: { type: String },
                image: { type: String },
            }
        ],
        proof_of_delivery: { type: [String], default: [] },
    },
    {
        timestamps: true,
        strict: false, // Allow fields from both ecommerce (userId) and mobile (user_id) backends
    }
);

// User order history — frequently used as Order.find({ user_id / userId }).sort({ createdAt: -1 })
// `user_id` is written with strict: false (mobile writes user_id, web writes userId)
orderSchema.index({ user_id: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
