const express = require('express');
const router = express.Router();

/**
 * GET /api/mobile/config
 * Returns minimum supported mobile version, Nomod feature flag, and available payment methods.
 * No auth required — clients call this on startup to gate-keep old app versions.
 */
router.get('/config', (req, res) => {
    const minSupportedVersion = process.env.MIN_SUPPORTED_MOBILE_VERSION || '1.0.0';
    const nomodEnabled = process.env.NOMOD_ENABLED === 'true';

    const paymentMethods = ['stripe'];
    if (nomodEnabled) paymentMethods.push('nomod');
    if (process.env.TABBY_AUTH_KEY && process.env.TABBY_SECRET_KEY) paymentMethods.push('tabby');

    return res.status(200).json({
        minSupportedVersion,
        nomodEnabled,
        paymentMethods,
    });
});

module.exports = router;
