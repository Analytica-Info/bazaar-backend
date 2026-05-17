'use strict';

const mongoose = require('mongoose');
const { ALLOWED_VERTICALS } = require('../services/verticals/domain/constants');

const notifyMeSubscriptionSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        vertical: {
            type: String,
            required: true,
            enum: ALLOWED_VERTICALS,
        },
        pushOptIn: {
            type: Boolean,
            default: true,
        },
        deviceId: {
            type: String,
            default: null,
        },
        notifiedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

notifyMeSubscriptionSchema.index({ email: 1, vertical: 1 }, { unique: true });

module.exports = mongoose.model('NotifyMeSubscription', notifyMeSubscriptionSchema);
