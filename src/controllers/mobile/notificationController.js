const Notification = require("../../models/Notification");
const mongoose = require('mongoose');

exports.getNotification = async (req, res) => {
    const user_id = req.user._id;

    try {
        const allNotifications = await Notification.find({ 
            userId: user_id
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec();

        const unreadCount = allNotifications.filter(n => !n.read).length;

        res.status(200).json({
            success: true,
            notificationsCount: allNotifications.length,
            unreadCount: unreadCount,
            notifications: allNotifications
        });
    } catch (err) {
        console.error("Error fetching notifications:", err);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error",
            error: err.message 
        });
    }
};

exports.markNotificationsAsRead = async (req, res) => {
    const userId = req.user._id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: "No notification IDs provided." });
    }

    try {
        await Notification.updateMany(
            { _id: { $in: ids }, userId: userId },
            { $set: { read: true } }
        );

        res.status(200).json({ success: true, message: "Notifications marked as read." });
    } catch (err) {
        console.error("Error updating notifications:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.trackNotificationClick = async (req, res) => {
    const userId = req.user._id;
    const { notificationId } = req.body;

    if (!notificationId) {
        return res.status(400).json({ 
            success: false, 
            message: "Notification ID is required." 
        });
    }

    try {
        const notification = await Notification.findById(notificationId);

        if (!notification) {
            return res.status(404).json({ 
                success: false, 
                message: "Notification not found." 
            });
        }

        if (!notification.createdBy) {
            return res.status(400).json({ 
                success: false, 
                message: "This endpoint is only for admin notifications." 
            });
        }

        const isTargetUser = notification.sendToAll || 
            (notification.targetUsers && notification.targetUsers.some(
                id => id.toString() === userId.toString()
            ));

        if (!isTargetUser) {
            return res.status(403).json({ 
                success: false, 
                message: "User is not a target of this notification." 
            });
        }

        const userIdObj = new mongoose.Types.ObjectId(userId);
        const alreadyClicked = notification.clickedUsers.some(
            id => id.toString() === userId.toString()
        );

        if (!alreadyClicked) {
            notification.clickedUsers.push(userIdObj);
            await notification.save();
        }

        res.status(200).json({ 
            success: true, 
            message: "Notification click tracked successfully." 
        });
    } catch (err) {
        console.error("Error tracking notification click:", err);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error" 
        });
    }
};