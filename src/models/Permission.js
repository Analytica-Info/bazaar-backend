const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    description: { 
        type: String,
        trim: true
    },
    module: {
        type: String,
        required: true,
        trim: true
    },
    action: {
        type: String,
        required: true,
        trim: true,
        enum: ['view', 'create', 'edit', 'delete', 'manage']
    },
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

permissionSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Permission = mongoose.model('Permission', permissionSchema);

module.exports = Permission;

