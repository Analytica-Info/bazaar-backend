const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    message: String,
    email: String,
    orderId: String,
    read: { type: Boolean, default: false },
    scheduledDateTime: { type: Date },
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of user IDs for specific users
    sendToAll: { type: Boolean, default: false },
    clickedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users who clicked on notification
    // sentAt: no default — set only when we actually send (pending/scheduled stay undefined until send)
    sentAt: { type: Date },
    // status: pending (default) → sent only if ALL target users got it; failed if any one fails or past time unsent
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, // Admin who created the notification
    createdAt: { type: Date, default: Date.now }
}, { strict: false });

// Compound index for scheduled-notification cron query
// Without this, the cron scanned all 61,976 notifications every minute
// (~43 GB/day Atlas egress). See reports/2026-04-24-mongodb-traffic-analysis.md.
notificationSchema.index({ sentAt: 1, scheduledDateTime: 1 });
// User notifications tab — was scanning all 61,976 notifications
notificationSchema.index({ userId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;