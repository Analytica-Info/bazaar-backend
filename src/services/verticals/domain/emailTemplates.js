'use strict';

/**
 * emailTemplates.js — verticals notify-me email sending helpers.
 *
 * Each function builds an HTML template and calls sendEmail. The shell
 * (header logo, card surround, footer) matches the convention used in
 * src/services/auth/domain/emailTemplates.js and the other domain
 * template files (order, contact). Keeping the visual shell consistent
 * across the app means every email a user receives — recovery code,
 * order confirmation, vertical signup — feels like it came from the
 * same brand.
 */

const { sendEmail } = require('../../../mail/emailService');
const { buildHtml } = require('../../../utilities/emailShell');

/**
 * Confirmation email sent immediately after a user subscribes to a
 * coming-soon vertical via POST /v2/notify-me.
 *
 * @param {string} email
 * @param {string} verticalLabel — already-resolved display label, e.g. "Auction"
 */
async function sendSubscriptionConfirmationEmail(email, verticalLabel) {
    const subject = `You're on the list for Bazaar ${verticalLabel}`;
    const card = `<tr>
                                    <td style="padding:0 35px;">
                                        <h1 style="color:#1e1e2d; font-weight:600; margin:0 0 12px 0; font-size:24px;">
                                            You're on the Bazaar ${verticalLabel} waitlist
                                        </h1>
                                        <p style="color: #455056; font-size: 16px; line-height: 24px; margin: 0 0 12px 0;">
                                            Thanks for signing up. We'll send you an email and a push notification
                                            the moment <strong>${verticalLabel}</strong> launches on Bazaar.
                                        </p>
                                        <p style="color: #455056; font-size: 16px; line-height: 24px; margin: 0;">
                                            Stay tuned — exciting things are coming.
                                        </p>
                                    </td>
                                </tr>`;
    await sendEmail(email, subject, buildHtml(card));
}

/**
 * Launch-day blast email sent by notifyVerticalLaunch when a vertical
 * transitions from comingSoon → live.
 *
 * @param {string} email
 * @param {string} verticalLabel
 */
async function sendVerticalLaunchEmail(email, verticalLabel) {
    const subject = `${verticalLabel} is now live on Bazaar`;
    const card = `<tr>
                                    <td style="padding:0 35px;">
                                        <h1 style="color:#1e1e2d; font-weight:600; margin:0 0 12px 0; font-size:24px;">
                                            Bazaar ${verticalLabel} is now live
                                        </h1>
                                        <p style="color: #455056; font-size: 16px; line-height: 24px; margin: 0 0 12px 0;">
                                            You signed up to be notified when <strong>${verticalLabel}</strong>
                                            launched on Bazaar — and it's here.
                                        </p>
                                        <p style="color: #455056; font-size: 16px; line-height: 24px; margin: 0 0 24px 0;">
                                            Open the app to explore ${verticalLabel} now.
                                        </p>
                                        <p style="text-align:center; margin:0;">
                                            <a href="https://bazaar-uae.com"
                                               style="display:inline-block; padding:12px 28px; background:#1e1e2d; color:#fff;
                                                      text-decoration:none; border-radius:4px; font-weight:600; font-size:14px;">
                                                Open Bazaar
                                            </a>
                                        </p>
                                    </td>
                                </tr>`;
    await sendEmail(email, subject, buildHtml(card));
}

module.exports = {
    sendSubscriptionConfirmationEmail,
    sendVerticalLaunchEmail,
};
