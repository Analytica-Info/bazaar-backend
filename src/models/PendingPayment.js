const mongoose = require('mongoose');
const runtimeConfig = require('../config/runtime');

const pendingPaymentSchema = new mongoose.Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    payment_id: { 
        type: String, 
        required: true,
        unique: true 
    },
    payment_method: { 
        type: String, 
        required: true,
        enum: ['tabby', 'stripe', 'nomod']
    },
    order_data: {
        type: Object,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    expires_at: {
        type: Date,
        default: () => new Date(Date.now() + runtimeConfig.order.pendingPaymentExpiryMs) // 30 minutes default
    },
    webhook_received: {
        type: Boolean,
        default: false
    },
    webhook_status: {
        type: String,
        default: null
    },
    orderfrom: { 
        type: String, 
        default: '-', 
        index: true 
    },
    orderTime: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient queries — payment_id has unique:true which creates its own index.
pendingPaymentSchema.index({ user_id: 1 });
pendingPaymentSchema.index({ status: 1 });
pendingPaymentSchema.index({ expires_at: 1 });

const PendingPayment = mongoose.model('PendingPayment', pendingPaymentSchema);

module.exports = PendingPayment;
