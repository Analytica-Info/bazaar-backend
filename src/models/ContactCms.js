// models/Coupon.js
const mongoose = require('mongoose');

const contactCmsSchema = new mongoose.Schema({
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

});

const ContactCms = mongoose.model('ContactCms', contactCmsSchema);

module.exports = ContactCms;