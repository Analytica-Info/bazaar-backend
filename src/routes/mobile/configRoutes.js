const express = require('express');
const router = express.Router();

/**
 * GET /api/mobile/config
 * Returns minimum supported mobile version, Nomod feature flag, and available payment methods.
 * No auth required — clients call this on startup to gate-keep old app versions.
 *
 * V1 mobile clients never integrated Nomod, so `nomodEnabled` is always
 * `false` and `paymentMethods` never contains `'nomod'`. The response
 * shape is preserved (fields stay present) so any defensive client-side
 * `if (response.nomodEnabled)` checks continue parsing correctly.
 *
 * V2 clients that want Nomod read it from `GET /v2/config` and
 * `GET /v2/payment-methods`, which resolve from the DB-backed
 * paymentMethodConfig singleton (admin-toggleable without a deploy).
 */
router.get('/config', (req, res) => {
    const minSupportedVersion = process.env.MIN_SUPPORTED_MOBILE_VERSION || '1.0.0';

    const paymentMethods = ['stripe'];
    if (process.env.TABBY_AUTH_KEY && process.env.TABBY_SECRET_KEY) {
        paymentMethods.push('tabby');
    }

    return res.status(200).json({
        minSupportedVersion,
        nomodEnabled: false,
        paymentMethods,
    });
});

module.exports = router;
