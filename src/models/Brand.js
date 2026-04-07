const mongoose = require("mongoose");

const brandSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,  // Enforce uniqueness at the database level
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
});

// Ensure indexes are created
brandSchema.index({ id: 1 }, { unique: true });

const Brand = mongoose.model("Brand", brandSchema);

module.exports = Brand;
