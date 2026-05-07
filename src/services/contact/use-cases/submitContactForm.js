'use strict';

const contacts = require('../../../repositories').contacts.rawModel();
const { sendEmail } = require('../../../mail/emailService');
const { validateEmail } = require('../adapters/emailValidator');
const { buildContactConfirmationHtml, buildContactAdminNotificationHtml } = require('../domain/emailTemplates');

/**
 * Submit a contact form: validate email, send confirmation + admin notification, save to DB.
 */
async function submitContactForm({ email, name, subject, message, phone }) {
  if (!name) throw { status: 400, message: 'Name is required' };
  if (!email) throw { status: 400, message: 'Email is required' };
  if (!phone) throw { status: 400, message: 'Phone is required' };
  if (!subject) throw { status: 400, message: 'Subject is required' };
  if (!message) throw { status: 400, message: 'Message is required' };

  const result = await validateEmail(email);
  if (!result.valid) {
    throw {
      status: 400,
      message: 'The email address you provided is not valid. Please enter a valid email address.',
    };
  }

  const adminEmail = process.env.ADMIN_EMAIL;

  await sendEmail(email, 'Thank You for Contacting Bazaar E-Commerce!', buildContactConfirmationHtml());
  await sendEmail(adminEmail, 'New Contact Us Submission - Bazaar Bazaar E-Commerce', buildContactAdminNotificationHtml({ name, phone, email, message }));

  await contacts.create({ email, name, subject, message, phone });

  return 'Thank you for reaching out to Bazaar E-Commerce! We have received your message and will get back to you shortly.';
}

module.exports = { submitContactForm };
