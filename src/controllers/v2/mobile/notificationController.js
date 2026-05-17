/**
 * V2 Mobile Notification Controller (BFF layer)
 */
const notificationService = require('../../../services/notificationService');
const { paginated, wrap } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');
const { BadRequestError } = require('../../../services/_kernel/errors');

exports.getNotifications = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = await notificationService.getUserNotifications(req.user._id, { page, limit });
    return res.status(200).json(
        paginated(result.notifications, result.total, result.page, result.limit, { unreadCount: result.unreadCount })
    );
});

/**
 * PATCH /v2/notifications
 * Body: { read: true, ids?: string[] }
 * If ids is present, marks those; otherwise marks all unread for the user.
 */
exports.updateReadState = asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    if (ids.length > 100) {
        throw new BadRequestError('Too many notification IDs in a single request (max 100).');
    }
    await notificationService.markNotificationsAsRead(req.user._id, ids);
    return res.status(200).json(wrap(null, 'Notifications marked as read'));
});

// Alias kept so any lingering internal references still resolve.
exports.markRead = exports.updateReadState;

/**
 * POST /v2/notifications/:id/clicks
 * Records a tap/click on a specific notification.
 */
exports.recordClick = asyncHandler(async (req, res) => {
    await notificationService.trackNotificationClick(req.user._id, req.params.id);
    return res.status(200).json(wrap(null, 'Click tracked'));
});

// Alias for old name.
exports.trackClick = exports.recordClick;
