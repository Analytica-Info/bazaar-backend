const mongoose = require('mongoose');

const emailConfigSchema = new mongoose.Schema({
    adminEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: 'Please enter a valid email address'
        }
    },
    ccEmails: [{
        type: String,
        trim: true,
        lowercase: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: 'Please enter a valid email address'
        }
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Only allow one active email config
emailConfigSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

emailConfigSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const EmailConfig = mongoose.model('EmailConfig', emailConfigSchema);

module.exports = EmailConfig;

