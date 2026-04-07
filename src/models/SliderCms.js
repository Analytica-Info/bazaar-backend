
const mongoose = require('mongoose');

const sliderCmsSchema = new mongoose.Schema({
    sliderImage1: {
    type: String,
    required: true
  },
  
  sliderImage2: {
    type: String,
    required: true
  },
  
  sliderImage3: {
    type: String,
    required: true
  },
  

 
});

const SliderCms = mongoose.model('SliderCms', sliderCmsSchema);

module.exports = SliderCms;