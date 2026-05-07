'use strict';

const nodemailer = require('nodemailer');
const async = require('async');
const logger = require('../../../utilities/logger');

/**
 * Send bulk emails via nodemailer with concurrency limiting.
 * @param {{ emails: string[], subject: string, htmlContent: string, cc?: string[], bcc?: string[] }}
 * @returns {Promise<{ message: string }>}
 */
async function sendBulkEmails({ emails, subject, htmlContent, cc, bcc }) {
  if (!emails || !subject || !htmlContent) {
    throw { status: 400, message: 'Missing required fields' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const allRecipients = [...emails, ...(cc || []), ...(bcc || [])];

  return new Promise((resolve, reject) => {
    async.eachLimit(
      allRecipients,
      10,
      (recipient, callback) => {
        const mailOptions = {
          from: process.env.EMAIL_USERNAME,
          to: recipient,
          cc,
          bcc,
          subject,
          html: htmlContent,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            logger.error({ err: error, recipient }, 'Error sending bulk email');
          } else {
            logger.info({ recipient, response: info.response }, 'Bulk email sent');
          }
          callback();
        });
      },
      (err) => {
        transporter.close();
        if (err) {
          logger.error({ err }, 'Error in bulk email sending');
          reject({ status: 500, message: 'Failed to send emails' });
        } else {
          logger.info('Bulk email sending completed');
          resolve({ message: 'Emails sent successfully' });
        }
      }
    );
  });
}

module.exports = { sendBulkEmails };
