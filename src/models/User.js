const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, default: 1 }
}, { _id: false });

const addressSchema = new mongoose.Schema({
    name: { type: String, required: true },
    city: { type: String, required: true },
    area: { type: String, required: true },
    email: { type: String },
    floorNo: { type: String, required: true },
    apartmentNo: { type: String, required: true },
    landmark: { type: String, required: true },
    state: { type: String, required: false },
    mobile: { type: String, required: true },
    buildingName: { type: String, default: null },
    isPrimary: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: { type: String, default: null },
    avatar: String,
    phone: { type: String, default: null },
    authProvider: { type: String, default: 'local' },
    role: { type: String, default: 'user' },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    refreshToken: { type: String },
    sessions: [{
        deviceId: { type: String },
        refreshToken: { type: String },
        fcmToken: { type: String, default: null },
        userAgent: { type: String, default: null },
        ip: { type: String, default: null },
        createdAt: { type: Date, default: Date.now },
        lastUsed: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null }
    }],
    customerId: { type: String },
    appleId: { type: String },
    username: { type: String },
    fcmToken: { type: String, default: null },
    recoveryCode: { type: String, default: null },
    recoveryCodeExpires: { type: Date, default: null },
    recoveryAttempts: { type: Number, default: 0 },
    lastRecoveryRequest: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, enum: ['user', 'admin'], default: null },
    isBlocked: { type: Boolean, default: false },
    blockedAt: { type: Date, default: null },
    usedFirst15Coupon: { type: Boolean, default: false },
    platform: { type: String, default: null },
    cart: [cartItemSchema],
    address: [addressSchema],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }]
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
