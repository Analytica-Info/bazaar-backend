const mongoose = require('mongoose');

const couponsCountSchema = new mongoose.Schema({
 count: {
    type:  Number,
    required: true
  },
 
});

const CouponsCount = mongoose.model('couponsCount', couponsCountSchema);

module.exports = CouponsCount;