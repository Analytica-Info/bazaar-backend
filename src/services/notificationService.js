const mongoose = require('mongoose');
const repos = require('../repositories');
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
        const allValid = await repos.users.allExist(targetUsers);
        if (!allValid) {
            throw { status: 400, message: 'Some user IDs are invalid' };
        }
    }

    const created = await repos.notifications.create({
        title,
        message,
        scheduledDateTime: scheduledDateTime ? new Date(scheduledDateTime) : null,
        sendToAll: sendToAll || false,
        targetUsers: targetUsers || [],
        clickedUsers: [],
        createdBy: adminId,
        createdAt: getUaeDateTime(),
    });

    // Activity logging
    const adminForLog = adminId ? await repos.admins.findForActivityLog(adminId) : null;
    const createMessage = created.scheduledDateTime
        ? `Notification created and scheduled for ${new Date(created.scheduledDateTime).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true })} (Dubai).`
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
            notification_id: created._id.toString(),
            title: created.title,
            scheduledDateTime: created.scheduledDateTime || null,
            sendToAll: created.sendToAll,
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
        logger.info({ notificationId: created._id.toString(), trigger: sendInstantly ? 'Send Instantly' : 'Past schedule' }, '[Notification Create] Sending now');
        await sendNotificationToUsers(created._id);
    } else {
        const s = created.scheduledDateTime ? new Date(created.scheduledDateTime).toISOString() : null;
        const dubai = created.scheduledDateTime
            ? new Date(created.scheduledDateTime).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true })
            : null;
        logger.info({ notificationId: created._id.toString(), utc: s, dubai }, '[Notification Create] Scheduled for later');
    }

    // Return fresh doc so caller gets correct status/sentAt
    const fresh = await repos.notifications.findById(created._id);
    return fresh || created;
}

/**
 * Get paginated list of admin-created notifications with counts.
 * @returns {{ notifications: Array, pagination: Object }}
 */
async function getNotifications({ page = 1, limit = 10 } = {}) {
    const { items, total } = await repos.notifications.listAdminNotificationsPaginated({ page, limit });
    const totalPages = Math.ceil(total / limit);

    const notificationsWithCounts = items.map(notif => {
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
            totalNotifications: total,
            notificationsPerPage: limit,
        },
    };
}

/**
 * Get full notification details with clicked / not-clicked breakdown.
 * @returns {Object} Enriched notification object.
 */
async function getNotificationDetails(notificationId) {
    const notification = await repos.notifications.findByIdWithCreator(notificationId);
    if (!notification) {
        throw { status: 404, message: 'Notification not found' };
    }

    // For sendToAll notifications avoid loading the entire user collection.
    const MAX_USER_SAMPLE = 500;

    const targetUserIds = notification.targetUsers || [];
    const clickedUserIdRefs = notification.clickedUsers || [];

    const clickedUserIdSet = new Set(clickedUserIdRefs.map(id => id.toString()));
    const notClickedIds = targetUserIds.filter(id => !clickedUserIdSet.has(id.toString()));

    let totalTargetUsers;
    let clickedUsers;
    let notClickedUsers;

    if (notification.sendToAll) {
        totalTargetUsers = await repos.users.countAll();

        const clickedObjectIds = [...clickedUserIdSet].map(id => new mongoose.Types.ObjectId(id));
        [clickedUsers, notClickedUsers] = await Promise.all([
            repos.users.findByIdsCapped(clickedObjectIds, { limit: MAX_USER_SAMPLE }),
            repos.users.findExcludingIdsCapped(clickedObjectIds, { limit: MAX_USER_SAMPLE }),
        ]);
    } else {
        totalTargetUsers = targetUserIds.length;

        [clickedUsers, notClickedUsers] = await Promise.all([
            repos.users.findByIdsCapped(clickedUserIdRefs, { limit: MAX_USER_SAMPLE }),
            repos.users.findByIdsCapped(notClickedIds, { limit: MAX_USER_SAMPLE }),
        ]);
    }

    const targetUsersSample = notification.sendToAll
        ? []
        : await repos.users.findByIdsCapped(targetUserIds, { limit: MAX_USER_SAMPLE });

    return {
        ...notification.toObject(),
        targetUsers: targetUsersSample,
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
    const notification = await repos.notifications.findByIdAsDocument(notificationId);
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
        const allValid = await repos.users.allExist(targetUsers);
        if (!allValid) {
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
    const notification = await repos.notifications.findById(notificationId);
    if (!notification) {
        throw { status: 404, message: 'Notification not found' };
    }

    if (notification.sentAt) {
        throw { status: 400, message: 'Cannot delete notification that has already been sent' };
    }

    await repos.notifications.deleteById(notificationId);
    return {};
}

/**
 * Search users with pagination.
 * @returns {{ users: Array, pagination: Object }}
 */
async function searchUsers({ search = '', page = 1, limit = 20 } = {}) {
    const regexSafe = search ? escapeRegex(search) : null;
    const { items, total } = await repos.users.searchPaginated({ regexSafe, page, limit });
    const totalPages = Math.ceil(total / limit);

    return {
        users: items,
        pagination: {
            currentPage: page,
            totalPages,
            totalUsers: total,
            usersPerPage: limit,
        },
    };
}

/**
 * Get all users sorted by name for notification targeting.
 * @returns {Array} Users array.
 */
async function getAllUsersForNotification() {
    return repos.users.listForNotificationTargeting({ limit: 1000 });
}

// ---------------------------------------------------------------------------
// User (mobile) functions
// ---------------------------------------------------------------------------

/**
 * Get notifications for a specific user with optional pagination.
 * @param {string|ObjectId} userId
 * @param {{ page?: number, limit?: number }} [opts]
 * @returns {{ notificationsCount: number, unreadCount: number, notifications: Array, total: number, page: number, limit: number }}
 */
async function getUserNotifications(userId, opts) {
    // v1 callers pass no opts — preserve legacy behavior: cap at 50, no skip,
    // notificationsCount = items returned (NOT total in DB).
    // v2 callers pass { page, limit } — paginate and return total separately.
    const paginate = !!(opts && (opts.page !== undefined || opts.limit !== undefined));
    const page = paginate ? Math.max(1, opts.page || 1) : 1;
    const limit = paginate ? Math.max(1, opts.limit || 20) : 50;

    const { items, total, unreadCount } = await repos.notifications.listForUser(userId, {
        paginate: true, // always apply the limit (legacy used .limit(50))
        page,
        limit,
    });

    return {
        // Preserve v1 semantics: notificationsCount = items returned (not DB total)
        notificationsCount: paginate ? total : items.length,
        unreadCount,
        notifications: items,
        total,
        page,
        limit,
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

    await repos.notifications.markReadForUser(userId, ids);
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

    const notification = await repos.notifications.findByIdAsDocument(notificationId);
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
    // User
    getUserNotifications,
    markNotificationsAsRead,
    trackNotificationClick,
};
