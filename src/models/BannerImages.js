const mongoose = require("mongoose");

const BannerImageSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        image: {
            type: String,
            required: true,
        },
    },
    { timestamps: true }
);

const BannerImages = mongoose.model("BannerImages", BannerImageSchema);

module.exports = { BannerImages };