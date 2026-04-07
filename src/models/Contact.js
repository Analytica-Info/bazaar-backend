const mongoose = require('mongoose');

const ContactUsSchema = new mongoose.Schema(
    {
        email: { type: String, required: true },
        name: { type: String, required: true },
        phone: { type: String, required: true },
        message: { type: String, required: true },
        subject: { type: String, required: true },
    },
    { 
        timestamps: true
    }
);

const contacts = mongoose.model('contacts', ContactUsSchema);
module.exports = contacts;