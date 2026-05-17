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
 * auth.optional() — works for anonymous and authenticated callers.
 * (Previously POST /v2/notify-me — Wave 3 rename.)
 */
async function subscribe(req, res) {
    try {
        const { email, vertical, pushOptIn, deviceId } = req.body || {};

        const result = await verticalsService.createSubscription({
            email,
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
