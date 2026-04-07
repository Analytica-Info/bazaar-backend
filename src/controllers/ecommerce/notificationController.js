const Notification = require('../../models/Notification');
const User = require('../../models/User');
const Admin = require('../../models/Admin');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../../config/jwtSecret');
const mongoose = require('mongoose');
const { sendNotificationToUsers } = require('../../helpers/sendPushNotification');
const { logActivity } = require('../../utilities/activityLogger');
const { logBackendActivity } = require('../../utilities/backendLogger');

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
    
    return new Date(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}+04:00`);
}

const getAdminIdFromToken = (req) => {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.id;
    } catch (error) {
        return null;
    }
};

exports.createNotification = async (req, res) => {
    try {
        const { title, message, scheduledDateTime, sendToAll, targetUsers } = req.body;

        // Console: verify received date/time format (DB stores UTC; 1:11 PM Dubai = 09:11 UTC)
        if (scheduledDateTime) {
            const d = new Date(scheduledDateTime);
            const utcStr = d.toISOString();
            const dubaiStr = d.toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true, dateStyle: 'short', timeStyle: 'medium' });
            console.log('[Notification Create] Received scheduledDateTime:', scheduledDateTime);
            console.log('[Notification Create] Parsed UTC (stored in DB):', utcStr);
            console.log('[Notification Create] Same time in Dubai:', dubaiStr);
        }

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        if (scheduledDateTime) {
            const scheduledDate = new Date(scheduledDateTime);
            const now = getUaeDateTime();
            if (scheduledDate < now) {
                return res.status(400).json({
                    success: false,
                    message: 'Scheduled date and time cannot be in the past'
                });
            }
        }

        const adminId = getAdminIdFromToken(req);
        if (!adminId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        if (!sendToAll && (!targetUsers || targetUsers.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'Either sendToAll must be true or targetUsers must be provided'
            });
        }

        if (targetUsers && targetUsers.length > 0) {
            const validUsers = await User.find({ _id: { $in: targetUsers } });
            if (validUsers.length !== targetUsers.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Some user IDs are invalid'
                });
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
            createdAt: getUaeDateTime()
        });

        await notification.save();

        // Activity logs: notification created
        const adminForLog = adminId ? await Admin.findById(adminId).select('firstName lastName email').lean() : null;
        const createMessage = notification.scheduledDateTime
            ? `Notification created and scheduled for ${new Date(notification.scheduledDateTime).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true })} (Dubai).`
            : 'Notification created and sent instantly.';
        await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Notification Created',
            status: 'success',
            message: createMessage,
            user: adminForLog ? { _id: adminForLog._id, name: [adminForLog.firstName, adminForLog.lastName].filter(Boolean).join(' ') || null, email: adminForLog.email } : null,
            details: { notification_id: notification._id.toString(), title: notification.title, scheduledDateTime: notification.scheduledDateTime || null, sendToAll: notification.sendToAll }
        }).catch(() => {});
        await logBackendActivity({
            platform: 'Website Backend',
            activity_name: 'Notification Created',
            status: 'success',
            message: createMessage,
            execution_path: 'notificationController.createNotification'
        }).catch(() => {});

        // Console: what was saved (MongoDB stores as UTC; UI/DB clients may show in local TZ)
        if (notification.scheduledDateTime) {
            const stored = new Date(notification.scheduledDateTime);
            console.log('[Notification Create] Saved to DB (UTC):', stored.toISOString());
            console.log('[Notification Create] Same as Dubai time:', stored.toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true }));
        }

        const sendInstantly = req.body.sendInstantly === true || req.body.sendInstantly === 'true';
        const sendNow = !scheduledDateTime || new Date(scheduledDateTime) <= getUaeDateTime();
        if (sendNow) {
            console.log('[Notification Create]', sendInstantly ? 'Send Instantly' : 'Past schedule', '— sending now. id:', notification._id.toString());
            await sendNotificationToUsers(notification._id);
        } else {
            const s = notification.scheduledDateTime ? new Date(notification.scheduledDateTime).toISOString() : null;
            const dubai = notification.scheduledDateTime ? new Date(notification.scheduledDateTime).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true }) : null;
            console.log('[Notification Create] Scheduled for later. id:', notification._id.toString(), '| UTC:', s, '| Dubai:', dubai);
        }

        // Return fresh doc from DB so client gets correct status/sentAt (e.g. 'failed' after send attempt)
        const notificationToReturn = await Notification.findById(notification._id).lean().exec() || notification;

        res.status(201).json({
            success: true,
            message: 'Notification created successfully',
            notification: notificationToReturn
        });
    } catch (error) {
        console.error('Create Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while creating notification',
            error: error.message
        });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
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

        res.status(200).json({
            success: true,
            notifications: notificationsWithCounts,
            pagination: {
                currentPage: page,
                totalPages,
                totalNotifications: totalCount,
                notificationsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Get Notifications Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching notifications',
            error: error.message
        });
    }
};

exports.getNotificationDetails = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findById(notificationId)
            .populate('createdBy', 'firstName lastName email')
            .populate('targetUsers', 'name email phone')
            .populate('clickedUsers', 'name email phone')
            .exec();

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        let allTargetUsers = [];
        if (notification.sendToAll) {
            allTargetUsers = await User.find()
                .select('name email phone fcmToken')
                .lean()
                .exec();
        } else {
            allTargetUsers = notification.targetUsers || [];
        }

        const clickedUserIds = notification.clickedUsers.map(u => u._id.toString());
        const clickedUsers = allTargetUsers.filter(u => clickedUserIds.includes(u._id.toString()));
        const notClickedUsers = allTargetUsers.filter(u => !clickedUserIds.includes(u._id.toString()));

        res.status(200).json({
            success: true,
            notification: {
                ...notification.toObject(),
                clickedUsers,
                notClickedUsers,
                totalTargetUsers: notification.sendToAll ? allTargetUsers.length : notification.targetUsers.length,
                totalClickedUsers: clickedUsers.length,
                totalNotClickedUsers: notClickedUsers.length
            }
        });
    } catch (error) {
        console.error('Get Notification Details Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching notification details',
            error: error.message
        });
    }
};

exports.updateNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const { title, message, scheduledDateTime, sendToAll, targetUsers } = req.body;

        const notification = await Notification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        if (notification.sentAt) {
            return res.status(400).json({
                success: false,
                message: 'Cannot update notification that has already been sent'
            });
        }

        if (notification.scheduledDateTime && new Date(notification.scheduledDateTime) <= getUaeDateTime()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot update notification after scheduled time has passed'
            });
        }

        if (scheduledDateTime) {
            const scheduledDate = new Date(scheduledDateTime);
            const now = getUaeDateTime();
            if (scheduledDate < now) {
                return res.status(400).json({
                    success: false,
                    message: 'Scheduled date and time cannot be in the past'
                });
            }
            notification.scheduledDateTime = scheduledDate;
        }

        if (sendToAll === false && (!targetUsers || targetUsers.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'Either sendToAll must be true or targetUsers must be provided'
            });
        }

        if (targetUsers && targetUsers.length > 0) {
            const validUsers = await User.find({ _id: { $in: targetUsers } });
            if (validUsers.length !== targetUsers.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Some user IDs are invalid'
                });
            }
        }

        if (title) notification.title = title;
        if (message) notification.message = message;
        if (sendToAll !== undefined) notification.sendToAll = sendToAll;
        if (targetUsers) notification.targetUsers = targetUsers;

        await notification.save();

        res.status(200).json({
            success: true,
            message: 'Notification updated successfully',
            notification
        });
    } catch (error) {
        console.error('Update Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating notification',
            error: error.message
        });
    }
};

exports.searchUsers = async (req, res) => {
    try {
        const searchQuery = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        let query = {};

        if (searchQuery) {
            query.$or = [
                { name: { $regex: searchQuery, $options: 'i' } },
                { email: { $regex: searchQuery, $options: 'i' } },
                { phone: { $regex: searchQuery, $options: 'i' } }
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

        res.status(200).json({
            success: true,
            users,
            pagination: {
                currentPage: page,
                totalPages,
                totalUsers: totalCount,
                usersPerPage: limit
            }
        });
    } catch (error) {
        console.error('Search Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while searching users',
            error: error.message
        });
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findById(notificationId);
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        if (notification.sentAt) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete notification that has already been sent'
            });
        }

        await Notification.findByIdAndDelete(notificationId);

        res.status(200).json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Delete Notification Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while deleting notification',
            error: error.message
        });
    }
};

exports.getAllUsersForNotification = async (req, res) => {
    try {
        const users = await User.find()
            .select('name email phone fcmToken')
            .sort({ name: 1 })
            .exec();

        res.status(200).json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Get All Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching users',
            error: error.message
        });
    }
};

