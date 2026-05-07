'use strict';

const stripe = require('stripe')(process.env.STRIPE_SK);
const orderService = require('../../services/orderService');
const logger = require('../../utilities/logger');
const { logBackendActivity } = require('../../utilities/backendLogger');

/**
 * Stripe webhook receiver.
 *
 * Express MUST NOT have parsed the body before this handler runs —
 * signature verification requires the raw bytes. The route registration
 * in server.js uses `express.raw({ type: 'application/json' })` for
 * this path only, so req.body is a Buffer here.
 *
 * Route: POST /api/webhooks/stripe
 */
exports.handleStripe = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
        logger.error('[StripeWebhook] STRIPE_WEBHOOK_SECRET not configured');
        return res.status(500).json({ error: 'webhook not configured' });
    }

    let event;
    try {
        // req.body is a Buffer because of express.raw() registered upstream.
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
        logger.warn({ err: err.message }, '[StripeWebhook] signature verification failed');
        await logBackendActivity({
            platform: 'Stripe Webhook',
            activity_name: 'Signature Verification Failed',
            status: 'failure',
            message: err.message,
            execution_path: 'stripeWebhookController.handleStripe',
        });
        return res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
    }

    logger.info(
        { eventType: event.type, eventId: event.id },
        '[StripeWebhook] event received'
    );

    try {
        const result = await orderService.handleStripeWebhook(event);
        // Always 200 if the event was processed (or intentionally skipped).
        // Stripe retries on non-2xx, so we only return non-200 on signature
        // failure (above) or unhandled exceptions (below).
        return res.status(200).json({ received: true, ...result });
    } catch (err) {
        logger.error({ err, eventId: event.id }, '[StripeWebhook] handler threw');
        // Return 500 so Stripe retries — idempotency in the use-case prevents
        // duplicate orders on the retry.
        return res.status(500).json({ error: 'handler error' });
    }
};
