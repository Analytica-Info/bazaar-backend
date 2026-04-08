const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  shippingRate: { type: Number, default: null },
});

const citySchema = new mongoose.Schema({
  name: { type: String, required: true },
  shippingRate: { type: Number, default: null },
  areas: [areaSchema],
});

const shippingCountrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, uppercase: true },
    currency: { type: String, required: true, uppercase: true },
    currencySymbol: { type: String, required: true },
    defaultShippingRate: { type: Number, required: true, default: 0 },
    freeShippingThreshold: { type: Number, default: null },
    cities: [citySchema],
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

shippingCountrySchema.index({ code: 1 }, { unique: true });
shippingCountrySchema.index({ isActive: 1, sortOrder: 1 });

const ShippingCountry = mongoose.model("ShippingCountry", shippingCountrySchema);
module.exports = ShippingCountry;
