
const mongoose = require('mongoose');

const categoryImagesCmsSchema = new mongoose.Schema({

    Electronics: {
    type: String,
    required: true
  },
  
  Home: {
    type: String,
    required: true
  },
  
  Sports: {
    type: String,
    required: true
  },

  Toys: {
    type: String,
    required: true
  },
  
  Home_Improvement: {
    type: String,
    required: true
  },
  

 
});

const CategoryImagesCms = mongoose.model('CategoryImagesCms', categoryImagesCmsSchema);

module.exports = CategoryImagesCms;