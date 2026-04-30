/**
 * V2 Mobile Notification Controller (BFF layer)
 */
const notificationService = require('../../../services/notificationService');
const { paginated, wrap } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');

exports.getNotifications = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const result = await notificationService.getUserNotifications(req.user._id, { page, limit });
        return res.status(200).json({
            ...paginated(result.notifications, result.total, result.page, result.limit),
            unreadCount: result.unreadCount,
        });
    } catch (error) {
        return handleError(res, error);
    }
};

exports.markRead = async (req, res) => {
    try {
        await notificationService.markNotificationsAsRead(req.user._id, req.body.ids);
        return res.status(200).json(wrap(null, 'Notifications marked as read'));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.trackClick = async (req, res) => {
    try {
        await notificationService.trackNotificationClick(req.user._id, req.body.notificationId);
        return res.status(200).json(wrap(null, 'Click tracked'));
    } catch (error) {
        return handleError(res, error);
    }
};
