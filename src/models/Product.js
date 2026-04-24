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

// Critical indexes — confirmed missing on 2026-04-24 analysis.
// Without these, Product.find({ "product.id": X }) did a COLLSCAN of 4,883 docs
// for every product-detail view, webhook, and sync, driving ~170GB/day of
// Atlas egress. See reports/2026-04-24-mongodb-traffic-analysis.md.
ProductSchema.index({ "product.id": 1 });
ProductSchema.index({ status: 1, totalQty: 1, discountedPrice: 1 });
ProductSchema.index({ "product.product_type_id": 1 });
ProductSchema.index({ isHighest: 1 }, { sparse: true });
// createdAt desc — used by getNewArrivals aggregation (was in-memory sort)
ProductSchema.index({ createdAt: -1 });
// variantsData.sku — used by getProductByVariant (color filter)
ProductSchema.index({ "variantsData.sku": 1 });

module.exports = mongoose.model("Product", ProductSchema);