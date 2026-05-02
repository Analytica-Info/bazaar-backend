'use strict';

const mongoose = require('mongoose');
const repos = require('../../../repositories');
const { escapeRegex } = require('../../../utilities/stringUtils');
const { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } = require('../../../config/constants/pagination');

/**
 * Get notifications for a specific user with optional pagination.
 */
async function getUserNotifications(userId, opts) {
  const paginate = !!(opts && (opts.page !== undefined || opts.limit !== undefined));
  const page = paginate ? Math.max(1, opts.page || 1) : 1;
  const limit = paginate ? Math.max(1, opts.limit || 20) : 50;

  const { items, total, unreadCount } = await repos.notifications.listForUser(userId, {
    paginate: true,
    page,
    limit,
  });

  return {
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

/**
 * Search users with pagination.
 */
async function searchUsers({ search = '', page = DEFAULT_PAGE, limit = DEFAULT_PAGE_SIZE } = {}) {
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
 */
async function getAllUsersForNotification() {
  return repos.users.listForNotificationTargeting({ limit: 1000 });
}

module.exports = {
  getUserNotifications,
  markNotificationsAsRead,
  trackNotificationClick,
  searchUsers,
  getAllUsersForNotification,
};
