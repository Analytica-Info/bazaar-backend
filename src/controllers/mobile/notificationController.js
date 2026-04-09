const notificationService = require("../../services/notificationService");

const logger = require("../../utilities/logger");
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
        logger.error({ err: err }, "Error fetching notifications:");
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
        logger.error({ err: err }, "Error updating notifications:");
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
        logger.error({ err: err }, "Error tracking notification click:");
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};
