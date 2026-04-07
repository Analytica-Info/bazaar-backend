const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    message: String,
    email: String,
    orderId: String,
    read: { type: Boolean, default: false },
    scheduledDateTime: { type: Date },
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sendToAll: { type: Boolean, default: false },
    clickedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sentAt: { type: Date },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
