/**
 * V2 API router — platform detection + dispatch.
 *
 * Applies the `platform` middleware first (sets req.platform).
 * Then mounts shared routes for all clients.
 * Then dispatches to the platform-specific BFF router.
 *
 * Mount point: /v2 (gated by V2_ENABLED=true in server.js)
 */
const express = require('express');
const router = express.Router();
const platformMiddleware = require('../../middleware/platform');

const mobileRouter = require('./mobile');
const webRouter = require('./web');
const sharedRouter = require('./shared');
const { wrapError } = require('../../controllers/v2/_shared/responseEnvelope');

router.use(platformMiddleware);

// Shared routes available to all clients regardless of platform
router.use('/', sharedRouter);

// Platform-specific BFF routes
router.use((req, res, next) => {
    if (req.platform === 'mobile') {
        return mobileRouter(req, res, next);
    }
    if (req.platform === 'web') {
        return webRouter(req, res, next);
    }
    return res.status(400).json(wrapError(
        'UNKNOWN_PLATFORM',
        'X-Client header required. Valid values: web, mobile'
    ));
});

module.exports = router;
