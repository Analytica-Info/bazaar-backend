
const mongoose = require('mongoose');

const contentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  paragraph: {
    type: String,
    required: true
  }
}, { _id: false }); // _id: false to prevent automatic _id for subdocs if not needed

const aboutCmsSchema = new mongoose.Schema({
    backgroundImage: {
    type: String,
    required: true
  },
  
 contents: {
    type: [contentSchema], // Array of content blocks
    required: true
  }

});

const AboutCms = mongoose.model('AboutCms', aboutCmsSchema);

module.exports = AboutCms;