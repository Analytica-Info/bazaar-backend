const mongoose = require('mongoose');

const brandsLogoSchema = new mongoose.Schema({
  images: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

const BrandsLogoCms = mongoose.model('BrandsLogoCms', brandsLogoSchema);

module.exports = BrandsLogoCms;