const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true, 
        unique: true,
        trim: true
    },
    description: { 
        type: String,
        trim: true
    },
    permissions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission'
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

roleSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;

