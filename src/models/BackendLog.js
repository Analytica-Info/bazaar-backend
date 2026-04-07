const mongoose = require('mongoose');

const backendLogSchema = new mongoose.Schema(
    {
        date: {
            type: String,
            required: true,
            index: true
        },
        platform: {
            type: String,
            required: true,
            enum: ['Mobile App Backend', 'Website Backend'],
            index: true
        },
        activities: [
            {
                activity_name: {
                    type: String,
                    required: true
                },
                status: {
                    type: String,
                    required: true,
                    enum: ['success', 'failure']
                },
                message: {
                    type: String,
                    required: true
                },
                order_id: {
                    type: String,
                    default: null
                },
                product_id: {
                    type: String,
                    default: null
                },
                product_name: {
                    type: String,
                    default: null
                },
                execution_path: {
                    type: String,
                    default: null
                },
                timestamp: {
                    type: Date,
                    default: Date.now
                },
                error_details: {
                    type: String,
                    default: null
                }
            }
        ],
        total_activities: {
            type: Number,
            default: 0
        },
        success_count: {
            type: Number,
            default: 0
        },
        failure_count: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true,
    }
);

// Index for efficient querying
backendLogSchema.index({ date: -1, platform: 1 });
backendLogSchema.index({ 'activities.timestamp': -1 });

const BackendLog = mongoose.model('BackendLog', backendLogSchema);

module.exports = BackendLog;

