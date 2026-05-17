'use strict';

const { sendEmail } = require('../../../mail/emailService');
const { buildFeedbackConfirmationHtml, buildFeedbackAdminNotificationHtml } = require('../domain/emailTemplates');

/**
 * Submit feedback from the mobile app.
 */
async function submitFeedback({ name, feedback, userEmail }) {
  if (!name) throw { status: 400, message: 'Name is required' };
  if (!feedback) throw { status: 400, message: 'Feedback is required' };
  if (!userEmail) throw { status: 400, message: 'User email not found. Please log in again.' };

  const adminEmail = process.env.ADMIN_EMAIL;

  await sendEmail(userEmail, 'Thank You for Your Feedback - Bazaar E-Commerce!', buildFeedbackConfirmationHtml());
  await sendEmail(adminEmail, 'New Feedback Submission - Bazaar E-Commerce (Mobile App)', buildFeedbackAdminNotificationHtml({ name, userEmail, feedback }));

  return 'Thank you for your feedback. We have received it and will review it shortly.';
}

module.exports = { submitFeedback };
