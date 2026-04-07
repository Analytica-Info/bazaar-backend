const mongoose = require('mongoose');
 
const couponSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    coupon: {
        type: String,
        required: true,
        unique: true,
    },
    phone: { type: String, default: '-' },
    id: { type: Number},
    name: { type: String, default: '-' },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    status: { 
        type: String,
        default: 'unused',
    },
});
 
const CouponMobile = mongoose.model('CouponMobile', couponSchema);

module.exports = CouponMobile;