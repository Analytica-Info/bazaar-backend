
const mongoose = require('mongoose');

const offerFilterCmsSchema = new mongoose.Schema({
  PriceRange1: {
    Image1: {
      type: String,
    },
    MinPrice1: {
      type: Number,
      required: true
    },
    MaxPrice1: {
      type: Number,
      required: true
    }
  },
  
  PriceRange2: {
    Image2: {
      type: String,
    },
    MinPrice2: {
      type: Number,
      required: true
    },
    MaxPrice2: {
      type: Number,
      required: true
    }
  },

 
});

const OfferFilterCms = mongoose.model('OfferFilterCms', offerFilterCmsSchema);

module.exports = OfferFilterCms;