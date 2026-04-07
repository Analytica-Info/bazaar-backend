const mongoose = require("mongoose");

const FlashSaleSchema = new mongoose.Schema({
    startDay: { type: String, required: true },   
    startTime: { type: String, required: true },  
    endDay: { type: String, required: true },     
    endTime: { type: String, required: true },
    isEnabled: { type: Boolean, default: true },
}, { timestamps: true });

const FlashSale = mongoose.model('FlashSale', FlashSaleSchema);

module.exports = FlashSale;