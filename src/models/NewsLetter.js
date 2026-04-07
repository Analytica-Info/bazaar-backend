const mongoose = require('mongoose');

const NewsLetterSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
}, { 
    timestamps: true // This will add 'createdAt' and 'updatedAt' fields automatically
});

const NewsLetter = mongoose.model('NewsLetter', NewsLetterSchema);

module.exports = NewsLetter;
