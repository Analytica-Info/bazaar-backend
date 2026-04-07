const mongoose = require('mongoose');

const offersCmsSchema = new mongoose.Schema({
  offersData: [
    {
        offerImage: String,
        offerCategory: String,
    },
  ],
});

const OffersCms = mongoose.model('OffersCms', offersCmsSchema);

module.exports = OffersCms;