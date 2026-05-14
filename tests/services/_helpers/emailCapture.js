'use strict';
/**
 * emailCapture — mock for src/mail/emailService + src/utilities/emailHelper
 *
 * Usage:
 *   jest.mock('../../src/mail/emailService', () => emailCapture.emailServiceMock());
 *   jest.mock('../../src/utilities/emailHelper', () => emailCapture.emailHelperMock());
 *
 *   // In beforeEach:
 *   emailCapture.reset();
 *
 *   // In assertions:
 *   const emails = emailCapture.getCapturedEmails();
 *   expect(emails).toHaveLength(1);
 *   expect(emails[0].to).toContain('admin@');
 *   expect(emails[0].subject).toContain('Order');
 */

const _captured = [];

const emailCapture = {
  reset() { _captured.length = 0; },
  getCapturedEmails() { return [..._captured]; },

  emailServiceMock() {
    return {
      sendEmail: jest.fn(async ({ to, subject, html, text }) => {
        _captured.push({ to, subject, html: html || '', text: text || '' });
      }),
    };
  },

  emailHelperMock() {
    return {
      getAdminEmail: jest.fn(async () => 'admin@bazaar-test.com'),
      getCcEmails: jest.fn(async () => []),
    };
  },
};

module.exports = emailCapture;
