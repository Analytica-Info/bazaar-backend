'use strict';

// ---------------------------------------------------------------------------
// Thin facade — all logic lives in src/services/contact/use-cases/
// ---------------------------------------------------------------------------

const { submitContactForm } = require('./contact/use-cases/submitContactForm');
const { submitFeedback } = require('./contact/use-cases/submitFeedback');
const { downloadFile } = require('./contact/use-cases/downloadFile');
const { createMobileAppLog } = require('./contact/use-cases/createMobileAppLog');

module.exports = {
  submitContactForm,
  submitFeedback,
  downloadFile,
  createMobileAppLog,
};
