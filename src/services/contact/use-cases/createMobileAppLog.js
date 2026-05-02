'use strict';

const ActivityLog = require('../../../repositories').activityLogs.rawModel();
const clock = require('../../../utilities/clock');

/**
 * Create a mobile app activity log entry.
 */
async function createMobileAppLog(data) {
  const { user_name, mobile_device, app_version, email, issue_message, activity_name } = data;

  if (!user_name) throw { status: 400, message: 'User name is required' };
  if (!mobile_device) throw { status: 400, message: 'Mobile device is required' };
  if (!app_version) throw { status: 400, message: 'App version is required' };
  if (!email) throw { status: 400, message: 'Email is required' };
  if (!issue_message) throw { status: 400, message: 'Issue/Message is required' };

  const dubaiDate = clock.now().toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const logEntry = await ActivityLog.create({
    platform: 'Mobile App Frontend',
    log_type: 'frontend_log',
    action: activity_name || 'User Issue/Message',
    status: 'success',
    message: `Mobile app log from ${user_name}`,
    user_name,
    user_email: email,
    mobile_device,
    app_version,
    issue_message,
    timestamp: clock.now(),
    details: {
      mobile_device,
      app_version,
      issue_message,
      activity_name: activity_name || 'User Issue/Message',
      dubai_datetime: dubaiDate,
    },
  });

  return { logId: logEntry._id };
}

module.exports = { createMobileAppLog };
