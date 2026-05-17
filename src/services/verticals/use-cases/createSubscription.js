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
 * @param {{ email: string, vertical: string, pushOptIn?: boolean, deviceId?: string }} input
 * @returns {Promise<{ alreadySubscribed: boolean }>}
 */
async function createSubscription({ email, vertical, pushOptIn = true, deviceId }) {
    if (!email || !EMAIL_RE.test(email)) {
        throw { status: 400, message: 'Invalid email' };
    }

    if (!vertical || !ALLOWED_VERTICALS.includes(vertical)) {
        throw { status: 400, message: 'Invalid vertical' };
    }

    const normalisedEmail = email.toLowerCase().trim();

    const { created } = await repos.notifyMeSubscriptions.upsert(
        normalisedEmail,
        vertical,
        { pushOptIn: Boolean(pushOptIn), deviceId: deviceId || null }
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
