const notificationService = require("../../services/notificationService");

exports.getNotification = async (req, res) => {
    const user_id = req.user._id;

    try {
        const result = await notificationService.getUserNotifications(user_id);

        res.status(200).json({
            success: true,
            notificationsCount: result.notificationsCount,
            unreadCount: result.unreadCount,
            notifications: result.notifications
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

    try {
        await notificationService.markNotificationsAsRead(userId, ids);

        res.status(200).json({ success: true, message: "Notifications marked as read." });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ success: false, message: err.message });
        }
        console.error("Error updating notifications:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.trackNotificationClick = async (req, res) => {
    const userId = req.user._id;
    const { notificationId } = req.body;

    try {
        await notificationService.trackNotificationClick(userId, notificationId);

        res.status(200).json({
            success: true,
            message: "Notification click tracked successfully."
        });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({
                success: false,
                message: err.message
            });
        }
        console.error("Error tracking notification click:", err);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};
