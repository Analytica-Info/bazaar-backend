
const mongoose = require('mongoose');

const shopCmsSchema = new mongoose.Schema({
    Image1: {
    type: String,
    required: true
  },
  
  Image2: {
    type: String,
    required: true
  },

 
});

const ShopCms = mongoose.model('ShopCms', shopCmsSchema);

module.exports = ShopCms;