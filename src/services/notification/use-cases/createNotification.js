'use strict';

const mongoose = require('mongoose');
const repos = require('../../../repositories');
const { sendNotificationToUsers } = require('../../../helpers/sendPushNotification');
const { logActivity } = require('../../../utilities/activityLogger');
const { logBackendActivity } = require('../../../utilities/backendLogger');
const logger = require('../../../utilities/logger');
const { getUaeDateTime } = require('../domain/uaeDateTime');

/**
 * Create a new notification, optionally send immediately.
 */
async function createNotification({ title, message, scheduledDateTime, sendToAll, targetUsers, adminId, sendInstantly }) {
  if (!title || !message) {
    throw { status: 400, message: 'Title and message are required' };
  }

  if (scheduledDateTime) {
    const scheduledDate = new Date(scheduledDateTime);
    const now = getUaeDateTime();
    if (scheduledDate < now) {
      throw { status: 400, message: 'Scheduled date and time cannot be in the past' };
    }
  }

  if (!adminId) {
    throw { status: 401, message: 'Unauthorized' };
  }

  if (!sendToAll && (!targetUsers || targetUsers.length === 0)) {
    throw { status: 400, message: 'Either sendToAll must be true or targetUsers must be provided' };
  }

  if (targetUsers && targetUsers.length > 0) {
    const allValid = await repos.users.allExist(targetUsers);
    if (!allValid) {
      throw { status: 400, message: 'Some user IDs are invalid' };
    }
  }

  const created = await repos.notifications.create({
    title,
    message,
    scheduledDateTime: scheduledDateTime ? new Date(scheduledDateTime) : null,
    sendToAll: sendToAll || false,
    targetUsers: targetUsers || [],
    clickedUsers: [],
    createdBy: adminId,
    createdAt: getUaeDateTime(),
  });

  const adminForLog = adminId ? await repos.admins.findForActivityLog(adminId) : null;
  const createMessage = created.scheduledDateTime
    ? `Notification created and scheduled for ${new Date(created.scheduledDateTime).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true })} (Dubai).`
    : 'Notification created and sent instantly.';

  await logActivity({
    platform: 'Website Backend',
    log_type: 'backend_activity',
    action: 'Notification Created',
    status: 'success',
    message: createMessage,
    user: adminForLog
      ? {
          _id: adminForLog._id,
          name: [adminForLog.firstName, adminForLog.lastName].filter(Boolean).join(' ') || null,
          email: adminForLog.email,
        }
      : null,
    details: {
      notification_id: created._id.toString(),
      title: created.title,
      scheduledDateTime: created.scheduledDateTime || null,
      sendToAll: created.sendToAll,
    },
  }).catch(() => {});

  await logBackendActivity({
    platform: 'Website Backend',
    activity_name: 'Notification Created',
    status: 'success',
    message: createMessage,
    execution_path: 'notificationService.createNotification',
  }).catch(() => {});

  const shouldSendNow = !scheduledDateTime || new Date(scheduledDateTime) <= getUaeDateTime();
  if (shouldSendNow) {
    logger.info({ notificationId: created._id.toString(), trigger: sendInstantly ? 'Send Instantly' : 'Past schedule' }, '[Notification Create] Sending now');
    await sendNotificationToUsers(created._id);
  } else {
    const s = created.scheduledDateTime ? new Date(created.scheduledDateTime).toISOString() : null;
    const dubai = created.scheduledDateTime
      ? new Date(created.scheduledDateTime).toLocaleString('en-US', { timeZone: 'Asia/Dubai', hour12: true })
      : null;
    logger.info({ notificationId: created._id.toString(), utc: s, dubai }, '[Notification Create] Scheduled for later');
  }

  const fresh = await repos.notifications.findById(created._id);
  return fresh || created;
}

module.exports = { createNotification };
