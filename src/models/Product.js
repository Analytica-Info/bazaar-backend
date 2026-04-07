const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
    product: Object, // Stores the full product object
    variantsData: Array, // Stores the variants data
    totalQty: Number, // Stores total quantity
    sold: { type: Number, default: 0 }, 
    status: { type: Boolean,  default: true },
    webhook: { type: String },
    webhookTime: { type: String },
    discount: Number,
    originalPrice: Number,
    discountedPrice: Number,
    isHighest: { type: Boolean, default: false },
    isGift: { type: Boolean, default: false },
    giftVariantId: { type: String, default: null },
    giftThreshold: { type: Number, default: 400 },
}, { timestamps: true });

module.exports = mongoose.model("Product", ProductSchema);