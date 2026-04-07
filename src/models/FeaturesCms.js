const mongoose = require('mongoose');

const featuresCmsSchema = new mongoose.Schema({
  featureData: [
    {
      // image: String,
      title: String,
      paragraph: String,
    },
  ],
});

const FeaturesCms = mongoose.model('FeaturesCms', featuresCmsSchema);

module.exports = FeaturesCms;