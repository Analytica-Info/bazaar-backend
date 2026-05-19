'use strict';

const { wrap, wrapError } = require('../_shared/responseEnvelope');
const verticalsService = require('../../../services/verticalsService');
const logger = require('../../../utilities/logger');

/**
 * GET /v2/verticals
 * Public — no auth required.
 */
async function list(req, res) {
    try {
        const verticals = await verticalsService.listVerticals();
        return res.status(200).json(wrap({ verticals }, 'Verticals fetched successfully'));
    } catch (err) {
        logger.error({ err }, 'v2 listVerticals failed');
        return res.status(err.status || 500).json(
            wrapError('VERTICALS_FETCH_FAILED', err.message || 'Failed to fetch verticals')
        );
    }
}

/**
 * POST /v2/notifications/subscriptions
 * auth.required() (2026-05-19) — mobile dropped its email field and now relies on
 * the authenticated user's account email from the JWT. Guests get a 401 before
 * reaching this handler. Body-supplied `email` is intentionally ignored to
 * prevent a signed-in user from subscribing another user's email address.
 *
 * (Previously POST /v2/notify-me — Wave 3 rename.)
 */
async function subscribe(req, res) {
    try {
        const { vertical, pushOptIn, deviceId } = req.body || {};

        // Email is sourced from the authenticated user; any body.email is ignored.
        const email = req.user?.email;
        const userId = req.user?._id ? String(req.user._id) : null;

        if (!email) {
            // Defensive: auth.required() should have rejected before this point.
            return res.status(401).json(
                wrapError('UNAUTHORIZED', 'Sign in required to subscribe.')
            );
        }

        const result = await verticalsService.createSubscription({
            email,
            userId,
            vertical,
            pushOptIn,
            deviceId,
        });

        return res.status(200).json({
            ...wrap({ alreadySubscribed: result.alreadySubscribed }, 'Subscribed'),
        });
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json(
                wrapError('VALIDATION_ERROR', err.message)
            );
        }
        logger.error({ err }, 'v2 notifyMe failed');
        return res.status(500).json(
            wrapError('SUBSCRIBE_FAILED', err.message || 'Failed to subscribe')
        );
    }
}

module.exports = { list, subscribe };
