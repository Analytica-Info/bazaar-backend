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
 
const Coupon = mongoose.model('Coupon', couponSchema);
module.exports = Coupon;