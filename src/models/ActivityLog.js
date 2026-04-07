const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
    {
        platform: {
            type: String,
            required: true,
            enum: ['Mobile App Frontend', 'Mobile App Backend', 'Website Backend'],
            index: true
        },
        log_type: {
            type: String,
            required: true,
            enum: ['frontend_log', 'backend_activity'],
            index: true
        },
        action: {
            type: String,
            required: true,
            index: true
        },
        status: {
            type: String,
            required: true,
            enum: ['success', 'failure'],
            index: true
        },
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        user_name: {
            type: String,
            default: null
        },
        user_email: {
            type: String,
            default: null
        },
        message: {
            type: String,
            required: true
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        // For frontend logs
        mobile_device: {
            type: String,
            default: null
        },
        app_version: {
            type: String,
            default: null
        },
        issue_message: {
            type: String,
            default: null
        },
        // For backend logs
        order_id: {
            type: String,
            default: null,
            index: true
        },
        item_id: {
            type: String,
            default: null
        },
        error_details: {
            type: String,
            default: null
        },
        timestamp: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    {
        timestamps: true,
    }
);

// Index for efficient querying
activityLogSchema.index({ platform: 1, timestamp: -1 });
activityLogSchema.index({ log_type: 1, timestamp: -1 });
activityLogSchema.index({ status: 1, timestamp: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;

