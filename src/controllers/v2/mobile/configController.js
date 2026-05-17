'use strict';

const { asyncHandler } = require('../../../middleware');
const { wrap } = require('../_shared/responseEnvelope');
const { getPaymentRuntimeConfig } = require('../../../services/payments/getPaymentRuntimeConfig');

/**
 * GET /v2/mobile/config
 *
 * Minimal app-startup bootstrap. Returns ONLY the flags mobile needs before
 * the home screen renders:
 *
 *   - `minSupportedVersion` — semver string; mobile prompts an upgrade below this.
 *   - `bannersEnabled`      — boolean; home-screen carousel kill-switch.
 *                              Read by mobile via
 *                              `Bazaar-Mobile-App/lib/core/services/app_version_gate.dart`
 *                              → `AppVersionGate.remoteBannersEnabled`.
 *                              Fail-open: defaults to true; marketing flips
 *                              false via `PUT /v2/admin/payment-method-config`.
 *
 * Payment-provider availability for the checkout screen is served by
 * `GET /v2/payment-methods` (rich `{id, name, icon, enabled}` per provider).
 * Earlier versions of this endpoint also returned `nomodEnabled` and a
 * `paymentMethods` string array — both were duplicates of what
 * `/v2/payment-methods` exposes and have been removed. Mobile clients
 * read from `/v2/payment-methods` exclusively.
 */
exports.getConfig = asyncHandler(async (req, res) => {
  const minSupportedVersion = process.env.MIN_SUPPORTED_MOBILE_VERSION || '1.0.33';

  // Defensive — bootstrap config must never 500 on a DB blip. If the
  // paymentMethodConfig read fails (DB unreachable, Redis cold, etc.),
  // fall through to fail-open defaults (banners visible).
  let config;
  try {
    config = await getPaymentRuntimeConfig();
  } catch (_err) {
    config = { bannersEnabled: true };
  }
  // `bannersEnabled` defaults to true if the field is missing entirely
  // (e.g. a singleton document predating this field). Mobile fails-open
  // the same way, so missing/undefined/null all collapse to true.
  const bannersEnabled = config && config.bannersEnabled !== undefined && config.bannersEnabled !== null
    ? Boolean(config.bannersEnabled)
    : true;

  return res.status(200).json(wrap({
    minSupportedVersion,
    bannersEnabled,
  }));
});
