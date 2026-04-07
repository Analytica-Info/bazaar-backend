// models/Coupon.js
const mongoose = require('mongoose');

const footerInfoCmsSchema = new mongoose.Schema({
  logo: {
    type: String,
    required: true
  },
  tagLine: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  facebook: {
    type: String,
    required: true
  },
  tiktok: {
    type: String,
    required: true
  },
  instagram: {
    type: String,
    required: true
  },
  youtube: {
    type: String,
    required: true
  },
});

const FooterInfoCms = mongoose.model('FooterInfoCms', footerInfoCmsSchema);

module.exports = FooterInfoCms;