const Notification = require('../models/Notification');
const User = require('../models/User');
const Admin = require('../models/Admin');
const mongoose = require('mongoose');
const { sendNotificationToUsers } = require('../helpers/sendPushNotification');
const { logActivity } = require('../utilities/activityLogger');
const { logBackendActivity } = require('../utilities/backendLogger');

const logger = require("../utilities/logger");
const { escapeRegex } = require("../utilities/stringUtils");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUaeDateTime() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dubai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === "year").value);
    const month = parseInt(parts.find(p => p.type === "month").value) - 1;
    const day = parseInt(parts.find(p => p.type === "day").value);
    const hour = parseInt(parts.find(p => p.type === "hour").value);
    const minute = parseInt(parts.find(p => p.type === "minute").value);
    const second = parseInt(parts.find(p => p.type === "second").value);
    const milliseconds = now.getMilliseconds();

    return new Date(
        `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
        `T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}` +
        `.${String(milliseconds).padStart(3, '0')}+04:00`
    );
}

// ---------------------------------------------------------------------------
// Admin (ecommerce) functions
// ---------------------------------------------------------------------------

/**
 * Create a new notification, optionally send immediately.
 * @returns {Object} The saved notification document.
 */
async function createNotification({ title, message, scheduledDateTime, sendToAll, targetUsers, adminId, sendInstantly }) {
    if (!title || !message) {
        throw { status: 400, message: 'Title and message are required' };
    }

    if (scheduledDateTime) {
        const scheduledDate = new Date(scheduledDateTime);
        const now = getUaeDateTime();
        if (scheduledDate < now) {
            throw { status: 400, message: 'Scheduled date and time cannot be in the past' };
        }
    }

    if (!adminId) {
        throw { status: 401, message: 'Unauthorized' };
    }

    if (!sendToAll && (!targetUsers || targetUsers.length === 0)) {
        throw { status: 400, message: 'Either sendToAll must be true or targetUsers must be provided' };
    }

    if (targetUsers && targetUsers.length > 0) {
        const validUsers = await User.find({ _id: { $in: targetUsers } });
        if (validUsers.length !== targetUsers.length) {
            throw { status: 400, message: 'Some user IDs are invalid' };
        }
    }

    const notification = new Notification({
        title,
        message,
        scheduledDateTime: scheduledDateTime ? new Date(scheduledDateTime) : null,
        sendToAll: sendToAll || false,
        targetUsers: targetUsers || [],
        clickedUsers: [],
        createdBy: adminId,
        createdAt: getUaeDateTime(),
    });

    await notification.save();

    // Activity logging
    const adminForLog = adminId
        ? await Admin.findById(adminId).select('firstName lastName email').lean()
        : null;
    const createMessage = notification.scheduledDateTime
        ? `Notification created and scheduled for ${new Date(notification.scheduledDateTime).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true })} (Dubai).`
        : 'Notification created and sent instantly.';

    await logActivity({
        platform: 'Website Backend',
        log_type: 'backend_activity',
        action: 'Notification Created',
        status: 'success',
        message: createMessage,
        user: adminForLog
            ? {
                  _id: adminForLog._id,
                  name: [adminForLog.firstName, adminForLog.lastName].filter(Boolean).join(' ') || null,
                  email: adminForLog.email,
              }
            : null,
        details: {
            notification_id: notification._id.toString(),
            title: notification.title,
            scheduledDateTime: notification.scheduledDateTime || null,
            sendToAll: notification.sendToAll,
        },
    }).catch(() => {});

    await logBackendActivity({
        platform: 'Website Backend',
        activity_name: 'Notification Created',
        status: 'success',
        message: createMessage,
        execution_path: 'notificationService.createNotification',
    }).catch(() => {});

    // Determine whether to send now
    const shouldSendNow = !scheduledDateTime || new Date(scheduledDateTime) <= getUaeDateTime();
    if (shouldSendNow) {
        console.log('[Notification Create]', sendInstantly ? 'Send Instantly' : 'Past schedule', '— sending now. id:', notification._id.toString());
        await sendNotificationToUsers(notification._id);
    } else {
        const s = notification.scheduledDateTime ? new Date(notification.scheduledDateTime).toISOString() : null;
        const dubai = notification.scheduledDateTime
            ? new Date(notification.scheduledDateTime).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true })
            : null;
        console.log('[Notification Create] Scheduled for later. id:', notification._id.toString(), '| UTC:', s, '| Dubai:', dubai);
    }

    // Return fresh doc so caller gets correct status/sentAt
    const notificationToReturn = await Notification.findById(notification._id).lean().exec() || notification;
    return notificationToReturn;
}

/**
 * Get paginated list of admin-created notifications with counts.
 * @returns {{ notifications: Array, pagination: Object }}
 */
async function getNotifications({ page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;
    const query = { createdBy: { $exists: true, $ne: null } };

    const notifications = await Notification.find(query)
        .populate('createdBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

    const totalCount = await Notification.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    const notificationsWithCounts = notifications.map(notif => {
        const notificationObj = notif.toObject();
        notificationObj.totalTargetUsers = notif.sendToAll ? 'All Users' : notif.targetUsers.length;
        notificationObj.totalClickedUsers = notif.clickedUsers.length;
        return notificationObj;
    });

    return {
        notifications: notificationsWithCounts,
        pagination: {
            currentPage: page,
            totalPages,
            totalNotifications: totalCount,
            notificationsPerPage: limit,
        },
    };
}

/**
 * Get full notification details with clicked / not-clicked breakdown.
 * @returns {Object} Enriched notification object.
 */
async function getNotificationDetails(notificationId) {
    // Fetch without populating large user arrays — we query them separately with caps.
    const notification = await Notification.findById(notificationId)
        .populate('createdBy', 'firstName lastName email')
        .exec();

    if (!notification) {
        throw { status: 404, message: 'Notification not found' };
    }

    // For sendToAll notifications avoid loading the entire user collection.
    // Return counts and a capped sample — the UI shows summaries, not full lists.
    const MAX_USER_SAMPLE = 500;

    // Raw ObjectId arrays from the document (no populate)
    const targetUserIds = notification.targetUsers || [];
    const clickedUserIdRefs = notification.clickedUsers || [];

    const clickedUserIdSet = new Set(clickedUserIdRefs.map(id => id.toString()));
    const notClickedIds = targetUserIds.filter(id => !clickedUserIdSet.has(id.toString()));

    let totalTargetUsers;
    let clickedUsers;
    let notClickedUsers;

    if (notification.sendToAll) {
        totalTargetUsers = await User.countDocuments();

        // Fetch both buckets with a cap — avoid loading the entire user collection
        [clickedUsers, notClickedUsers] = await Promise.all([
            User.find({ _id: { $in: [...clickedUserIdSet].map(id => new mongoose.Types.ObjectId(id)) } })
                .select('name email phone')
                .limit(MAX_USER_SAMPLE)
                .lean()
                .exec(),
            User.find({ _id: { $nin: [...clickedUserIdSet].map(id => new mongoose.Types.ObjectId(id)) } })
                .select('name email phone')
                .limit(MAX_USER_SAMPLE)
                .lean()
                .exec(),
        ]);
    } else {
        totalTargetUsers = targetUserIds.length;

        // Fetch actual user docs for both buckets with a cap
        [clickedUsers, notClickedUsers] = await Promise.all([
            clickedUserIdRefs.length
                ? User.find({ _id: { $in: clickedUserIdRefs } })
                    .select('name email phone')
                    .limit(MAX_USER_SAMPLE)
                    .lean()
                    .exec()
                : Promise.resolve([]),
            notClickedIds.length
                ? User.find({ _id: { $in: notClickedIds } })
                    .select('name email phone')
                    .limit(MAX_USER_SAMPLE)
                    .lean()
                    .exec()
                : Promise.resolve([]),
        ]);
    }

    return {
        ...notification.toObject(),
        clickedUsers,
        notClickedUsers,
        totalTargetUsers,
        totalClickedUsers: clickedUserIdRefs.length,
        totalNotClickedUsers: notification.sendToAll
            ? totalTargetUsers - clickedUserIdRefs.length
            : notClickedIds.length,
    };
}

/**
 * Update a notification that has not yet been sent.
 * @returns {Object} The updated notification document.
 */
async function updateNotification(notificationId, { title, message, scheduledDateTime, sendToAll, targetUsers }) {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
        throw { status: 404, message: 'Notification not found' };
    }

    if (notification.sentAt) {
        throw { status: 400, message: 'Cannot update notification that has already been sent' };
    }

    if (notification.scheduledDateTime && new Date(notification.scheduledDateTime) <= getUaeDateTime()) {
        throw { status: 400, message: 'Cannot update notification after scheduled time has passed' };
    }

    if (scheduledDateTime) {
        const scheduledDate = new Date(scheduledDateTime);
        const now = getUaeDateTime();
        if (scheduledDate < now) {
            throw { status: 400, message: 'Scheduled date and time cannot be in the past' };
        }
        notification.scheduledDateTime = scheduledDate;
    }

    if (sendToAll === false && (!targetUsers || targetUsers.length === 0)) {
        throw { status: 400, message: 'Either sendToAll must be true or targetUsers must be provided' };
    }

    if (targetUsers && targetUsers.length > 0) {
        const validUsers = await User.find({ _id: { $in: targetUsers } });
        if (validUsers.length !== targetUsers.length) {
            throw { status: 400, message: 'Some user IDs are invalid' };
        }
    }

    if (title) notification.title = title;
    if (message) notification.message = message;
    if (sendToAll !== undefined) notification.sendToAll = sendToAll;
    if (targetUsers) notification.targetUsers = targetUsers;

    await notification.save();
    return notification;
}

/**
 * Delete a notification that has not yet been sent.
 * @returns {{}}
 */
async function deleteNotification(notificationId) {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
        throw { status: 404, message: 'Notification not found' };
    }

    if (notification.sentAt) {
        throw { status: 400, message: 'Cannot delete notification that has already been sent' };
    }

    await Notification.findByIdAndDelete(notificationId);
    return {};
}

/**
 * Search users with pagination.
 * @returns {{ users: Array, pagination: Object }}
 */
async function searchUsers({ search = '', page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
        const safeSearch = escapeRegex(search);
        query.$or = [
            { name: { $regex: safeSearch, $options: 'i' } },
            { email: { $regex: safeSearch, $options: 'i' } },
            { phone: { $regex: safeSearch, $options: 'i' } },
        ];
    }

    const users = await User.find(query)
        .select('name email phone fcmToken')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec();

    const totalCount = await User.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    return {
        users,
        pagination: {
            currentPage: page,
            totalPages,
            totalUsers: totalCount,
            usersPerPage: limit,
        },
    };
}

/**
 * Get all users sorted by name for notification targeting.
 * @returns {Array} Users array.
 */
async function getAllUsersForNotification() {
    // Hard cap to prevent a full collection scan on large user bases.
    // Admin UI should use searchUsers() for targeted selection beyond this cap.
    const users = await User.find()
        .select('name email phone fcmToken')
        .sort({ name: 1 })
        .limit(1000)
        .lean()
        .exec();

    return users;
}

// ---------------------------------------------------------------------------
// User (mobile) functions
// ---------------------------------------------------------------------------

/**
 * Get notifications for a specific user.
 * @returns {{ notificationsCount: number, unreadCount: number, notifications: Array }}
 */
async function getUserNotifications(userId) {
    const allNotifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec();

    const unreadCount = allNotifications.filter(n => !n.read).length;

    return {
        notificationsCount: allNotifications.length,
        unreadCount,
        notifications: allNotifications,
    };
}

/**
 * Mark notifications as read for a user.
 * @returns {{}}
 */
async function markNotificationsAsRead(userId, ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
        throw { status: 400, message: 'No notification IDs provided.' };
    }

    await Notification.updateMany(
        { _id: { $in: ids }, userId },
        { $set: { read: true } }
    );

    return {};
}

/**
 * Track when a user clicks on an admin notification.
 * @returns {{}}
 */
async function trackNotificationClick(userId, notificationId) {
    if (!notificationId) {
        throw { status: 400, message: 'Notification ID is required.' };
    }

    const notification = await Notification.findById(notificationId);
    if (!notification) {
        throw { status: 404, message: 'Notification not found.' };
    }

    if (!notification.createdBy) {
        throw { status: 400, message: 'This endpoint is only for admin notifications.' };
    }

    const isTargetUser = notification.sendToAll ||
        (notification.targetUsers && notification.targetUsers.some(
            id => id.toString() === userId.toString()
        ));

    if (!isTargetUser) {
        throw { status: 403, message: 'User is not a target of this notification.' };
    }

    const userIdObj = new mongoose.Types.ObjectId(userId);
    const alreadyClicked = notification.clickedUsers.some(
        id => id.toString() === userId.toString()
    );

    if (!alreadyClicked) {
        notification.clickedUsers.push(userIdObj);
        await notification.save();
    }

    return {};
}

module.exports = {
    // Admin
    createNotification,
    getNotifications,
    getNotificationDetails,
    updateNotification,
    deleteNotification,
    searchUsers,
    getAllUsersForNotification,
    // User (mobile)
    getUserNotifications,
    markNotificationsAsRead,
    trackNotificationClick,
};
