const mongoose = require('mongoose');

const headerInfoCmsSchema = new mongoose.Schema({
  logo: {
    type: String,
    required: true
  },
  
  contactNumber: {
    type: String,
    required: true
  },
 
});

const HeaderInfoCms = mongoose.model('HeaderInfoCms', headerInfoCmsSchema);

module.exports = HeaderInfoCms;