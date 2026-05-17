'use strict';

const mongoose = require('mongoose');
const repos = require('../../../repositories');
const { getUaeDateTime } = require('../domain/uaeDateTime');
const { DEFAULT_PAGE, ADMIN_DEFAULT_PAGE_SIZE } = require('../../../config/constants/pagination');

/**
 * Get paginated list of admin-created notifications with counts.
 */
async function getNotifications({ page = DEFAULT_PAGE, limit = ADMIN_DEFAULT_PAGE_SIZE } = {}) {
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
 */
async function getNotificationDetails(notificationId) {
  const notification = await repos.notifications.findByIdWithCreator(notificationId);
  if (!notification) {
    throw { status: 404, message: 'Notification not found' };
  }

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

module.exports = { getNotifications, getNotificationDetails, updateNotification, deleteNotification };
