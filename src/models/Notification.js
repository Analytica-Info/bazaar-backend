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
notificationSchema.index({ sentAt: 1, scheduledDateTime: 1 });
// Scheduler compound — efficiently finds pending notifications due for delivery.
notificationSchema.index({ status: 1, scheduledDateTime: 1 });
// User notifications tab
notificationSchema.index({ userId: 1, createdAt: -1 });
// Admin notification list — getNotifications() filters on createdBy existence, sorted by createdAt
notificationSchema.index({ createdBy: 1, createdAt: -1 });
// Targeting queries — sendToAll flag used in delivery and detail lookups
notificationSchema.index({ sendToAll: 1 });
// Partial index — scheduler query after simplification only looks at pending docs.
// With 62K total but <100 pending at any time, this collapses the scan to ~O(pending).
notificationSchema.index(
    { scheduledDateTime: 1 },
    { partialFilterExpression: { status: "pending" } }
);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;