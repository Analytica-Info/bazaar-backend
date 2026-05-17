'use strict';

const mongoose = require('mongoose');

const verticalSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            required: true,
            unique: true,
        },
        label: {
            type: String,
            required: true,
        },
        tag: {
            type: String,
            default: null,
        },
        enabled: {
            type: Boolean,
            default: false,
        },
        comingSoon: {
            type: Boolean,
            default: false,
        },
        launchDate: {
            type: Date,
            default: null,
        },
        sortOrder: {
            type: Number,
            default: 99,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Vertical', verticalSchema);
