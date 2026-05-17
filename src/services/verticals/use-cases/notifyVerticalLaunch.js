'use strict';

const admin = require('firebase-admin');
const { ALLOWED_VERTICALS, FCM_TOPIC_PREFIX } = require('../domain/constants');
const { sendVerticalLaunchEmail } = require('../domain/emailTemplates');
const repos = require('../../../repositories');
const logger = require('../../../utilities/logger');

/**
 * Admin helper: blast a launch notification to all subscribers of a vertical.
 *
 * - Sends FCM topic push to the vertical topic (reaches all opted-in devices).
 * - Sends an email to every subscriber (push opt-in agnostic).
 * - Marks all subscription rows as notified so we don't double-send.
 *
 * NOT wired to a route in this pass — expose via admin script or future endpoint.
 *
 * @param {string} vertical  One of ALLOWED_VERTICALS.
 * @returns {Promise<{ emailsSent: number, fcmSent: boolean }>}
 */
async function notifyVerticalLaunch(vertical) {
    if (!ALLOWED_VERTICALS.includes(vertical)) {
        throw { status: 400, message: 'Invalid vertical' };
    }

    const labelMap = {
        auction: 'Auction',
        marketplace: 'Marketplace',
        wholesale: 'Wholesale',
        home: 'Home',
    };
    const label = labelMap[vertical];

    // 1. FCM topic push
    let fcmSent = false;
    try {
        const topic = `${FCM_TOPIC_PREFIX}${vertical}`;
        await admin.messaging().send({
            topic,
            notification: {
                title: `${label} is now live on Bazaar!`,
                body: `Tap to explore the new ${label} vertical.`,
            },
        });
        fcmSent = true;
        logger.info({ vertical, topic }, 'Launch push sent via FCM topic');
    } catch (err) {
        logger.warn({ err, vertical }, 'FCM topic launch push failed');
    }

    // 2. Email blast
    const subscribers = await repos.notifyMeSubscriptions.findAllSubscribers(vertical);
    let emailsSent = 0;

    for (const sub of subscribers) {
        try {
            await sendVerticalLaunchEmail(sub.email, label);
            emailsSent++;
        } catch (err) {
            logger.warn({ err, email: sub.email, vertical }, 'Launch email failed for subscriber');
        }
    }

    // 3. Mark notified
    await repos.notifyMeSubscriptions.markNotified(vertical);

    logger.info({ vertical, fcmSent, emailsSent }, 'notifyVerticalLaunch complete');
    return { emailsSent, fcmSent };
}

module.exports = { notifyVerticalLaunch };
