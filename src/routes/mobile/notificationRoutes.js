const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/mobile/notificationController');
const authMiddleware = require('../../middleware/authMiddleware');

router.get('/get-notification', authMiddleware, notificationController.getNotification);
router.post('/mark-read', authMiddleware, notificationController.markNotificationsAsRead);
router.post('/track-click', authMiddleware, notificationController.trackNotificationClick);

module.exports = router;