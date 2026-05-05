'use strict';

// ---------------------------------------------------------------------------
// Thin facade — all logic lives in src/services/newsletter/use-cases/ and adapters/
// ---------------------------------------------------------------------------

const { subscribe } = require('./newsletter/use-cases/subscribe');
const { getSubscribers } = require('./newsletter/use-cases/getSubscribers');
const { sendBulkEmails } = require('./newsletter/adapters/bulkMailer');

module.exports = {
  subscribe,
  getSubscribers,
  sendBulkEmails,
};
