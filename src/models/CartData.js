// models/CartData.js
const mongoose = require('mongoose');

const CartDataSchema = new mongoose.Schema({
    cartData: {
        type: Array, // or Object, depending on your structure
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('CartData', CartDataSchema);