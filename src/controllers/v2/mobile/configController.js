'use strict';

const { asyncHandler } = require('../../../middleware');
const { wrap } = require('../_shared/responseEnvelope');

/**
 * GET /v2/mobile/config
 * Returns startup configuration for the mobile app.
 * Mirrors the inline handler in src/routes/mobile/configRoutes.js.
 */
exports.getConfig = asyncHandler(async (req, res) => {
  const minSupportedVersion = process.env.MIN_SUPPORTED_MOBILE_VERSION || '1.0.33';
  const nomodEnabled = process.env.NOMOD_ENABLED === 'true';
  const paymentMethods = ['stripe'];

  if (nomodEnabled) paymentMethods.push('nomod');
  if (process.env.TABBY_AUTH_KEY && process.env.TABBY_SECRET_KEY) paymentMethods.push('tabby');

  return res.status(200).json(wrap({ minSupportedVersion, nomodEnabled, paymentMethods }));
});
