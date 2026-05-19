'use strict';

const admin = require('firebase-admin');
const { ALLOWED_VERTICALS, FCM_TOPIC_PREFIX } = require('../domain/constants');
const { sendSubscriptionConfirmationEmail } = require('../domain/emailTemplates');
const repos = require('../../../repositories');
const logger = require('../../../utilities/logger');

// Simple RFC-5322-ish regex — no MX lookup per spec.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Subscribe a user to a coming-soon vertical notification.
 *
 * Email is now sourced server-side from the authenticated JWT (req.user.email);
 * the controller passes it explicitly. `userId` is stored alongside the email
 * so downstream comms (launch-notification dispatch) can join back to the users
 * collection — pre-auth-required rows continue to have a null user_id and stay
 * in place.
 *
 * @param {{ email: string, userId?: string|null, vertical: string, pushOptIn?: boolean, deviceId?: string }} input
 * @returns {Promise<{ alreadySubscribed: boolean }>}
 */
async function createSubscription({ email, userId = null, vertical, pushOptIn = true, deviceId }) {
    // Validate vertical first — clients can hit this with a bad enum before any
    // email-related branching runs. Keeps the 400 path cheap and predictable.
    if (!vertical || !ALLOWED_VERTICALS.includes(vertical)) {
        throw { status: 400, message: 'Invalid vertical' };
    }

    if (!email || !EMAIL_RE.test(email)) {
        throw { status: 400, message: 'Invalid email' };
    }

    const normalisedEmail = email.toLowerCase().trim();

    const { created } = await repos.notifyMeSubscriptions.upsert(
        normalisedEmail,
        vertical,
        { pushOptIn: Boolean(pushOptIn), deviceId: deviceId || null, userId }
    );

    // Fire-and-forget: FCM topic subscription
    if (pushOptIn && deviceId) {
        setImmediate(async () => {
            try {
                const topic = `${FCM_TOPIC_PREFIX}${vertical}`;
                await admin.messaging().subscribeToTopic(deviceId, topic);
                logger.info({ vertical, topic }, 'FCM topic subscription succeeded');
            } catch (err) {
                logger.warn({ err, vertical }, 'FCM topic subscription failed — ignoring');
            }
        });
    }

    // Fire-and-forget: confirmation email — uses the shared Bazaar-branded
    // shell from verticals/domain/emailTemplates.js (same shell as auth/order/contact).
    setImmediate(async () => {
        try {
            const labelMap = {
                auction: 'Auction',
                marketplace: 'Marketplace',
                wholesale: 'Wholesale',
                home: 'Home',
            };
            const label = labelMap[vertical] || vertical;
            await sendSubscriptionConfirmationEmail(normalisedEmail, label);
        } catch (err) {
            logger.warn({ err }, 'Subscription confirmation email failed — ignoring');
        }
    });

    return { alreadySubscribed: !created };
}

module.exports = { createSubscription };
