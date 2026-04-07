// models/Coupon.js
const mongoose = require('mongoose');

const couponCmsSchema = new mongoose.Schema({
  logo: {
    type: String,
    required: true
  },
  mrBazaarLogo: {
    type: String,
    required: true
  },
  discountText: {
    type: String,
    required: true
  },
  discountTextExtra: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  facebookLink: {
    type: String,
    required: true
  },
  instagramLink: {
    type: String,
    required: true
  },
  tikTokLink: {
    type: String,
    required: true
  },
  youtubeLink: {
    type: String,
    required: true
  }
});

const CouponCms = mongoose.model('CouponCms', couponCmsSchema);

module.exports = CouponCms;