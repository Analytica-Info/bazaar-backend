'use strict';

// ---------------------------------------------------------------------------
// Thin facade — all logic lives in src/services/notification/use-cases/
// ---------------------------------------------------------------------------

const { createNotification } = require('./notification/use-cases/createNotification');
const { getNotifications, getNotificationDetails, updateNotification, deleteNotification } = require('./notification/use-cases/adminNotifications');
const { getUserNotifications, markNotificationsAsRead, trackNotificationClick, searchUsers, getAllUsersForNotification } = require('./notification/use-cases/userNotifications');

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
