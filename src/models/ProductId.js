const mongoose = require('mongoose');

const ProductIdSchema = new mongoose.Schema(
    {
        productId: {
            type: String,
            required: true,
            unique: true, // Ensures no duplicate IDs are stored
        },
    },
    {
        timestamps: true, // Automatically manage `createdAt` and `updatedAt` fields
    }
);

module.exports = mongoose.model('ProductId', ProductIdSchema);