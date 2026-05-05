'use strict';

/**
 * checkout/index.js — barrel
 *
 * Re-exports all checkout use-cases so the facade (checkoutService.js) and
 * any direct consumers can require('./checkout') instead of individual paths.
 * Extracted as part of PR-MOD-4 structural split.
 */

module.exports = {
  createStripeCheckout:    require('./use-cases/createStripeCheckout'),
  verifyStripePayment:     require('./use-cases/verifyStripePayment'),
  createTabbyCheckout:     require('./use-cases/createTabbyCheckout'),
  verifyTabbyPayment:      require('./use-cases/verifyTabbyPayment'),
  handleTabbyWebhook:      require('./use-cases/handleTabbyWebhook'),
  createNomodCheckout:     require('./use-cases/createNomodCheckout'),
  verifyNomodPayment:      require('./use-cases/verifyNomodPayment'),
  processCheckout:         require('./use-cases/processCheckout'),
};
