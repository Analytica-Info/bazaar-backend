const mongoose = require('mongoose');

const bankPromoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    discountPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    capAED: {
      type: Number,
      required: true,
      min: 0,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    singleUsePerCustomer: {
      type: Boolean,
      default: true,
    },
    exclusive: {
      type: Boolean,
      default: false,
    },
    allowedBank: {
      type: String,
      required: true,
      trim: true,
    },
    binRanges: {
      type: [String],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Prevent duplicate active codes with same name
bankPromoCodeSchema.index({ code: 1, active: 1 });

const BankPromoCode = mongoose.model('BankPromoCode', bankPromoCodeSchema);
module.exports = BankPromoCode;
