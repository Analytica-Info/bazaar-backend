const mongoose = require('mongoose');

const bankPromoCodeUsageSchema = new mongoose.Schema(
  {
    bankPromoCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankPromoCode',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

bankPromoCodeUsageSchema.index({ bankPromoCodeId: 1, userId: 1 }, { unique: true });

const BankPromoCodeUsage = mongoose.model('BankPromoCodeUsage', bankPromoCodeUsageSchema);
module.exports = BankPromoCodeUsage;
