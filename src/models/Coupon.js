const mongoose = require('mongoose');
 
// Define the Coupon schema
const couponSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  coupon: {
    type: String,
    required: true,
    unique: true, // Ensure each coupon code is unique
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
    default: 'unused', // Default value set to 'unused'
  },
});
 
// phone — queried on every login/auth (getCouponStatus called from 5 auth paths).
// Without this, every login does a full collection scan.
couponSchema.index({ phone: 1 }, { sparse: true });
// status — used in checkCouponCode: Coupon.findOne({ coupon, status: "unused" })
couponSchema.index({ status: 1 });
// Compound — covers the most common coupon validation query pattern.
couponSchema.index({ phone: 1, status: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;