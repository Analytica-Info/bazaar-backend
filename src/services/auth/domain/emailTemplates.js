'use strict';

/**
 * emailTemplates.js — auth-related email sending helpers.
 *
 * Each function builds an HTML template and calls sendEmail.
 * Kept together because all templates share the same branding shell.
 */

const { sendEmail } = require('../../../mail/emailService');
const { buildHtml } = require('../../../utilities/emailShell');

async function sendRecoveryEmail(email, code) {
    const subject = 'Account Recovery Code – Verify to Reactivate Your Account';
    const card = `<tr>
                                    <td style="padding:0 15px; margin-bottom:5px;">
                                        <strong style="display: block;font-size: 13px; margin: 0 0 4px; color:rgba(0,0,0,.64); font-weight:normal;">
                                            Your Recovery code is <strong>${code}</strong>
                                        </strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px; padding-left: 15px; padding-right: 15px;">Please note that this code is valid for the next <strong>15 minutes</strong>. If you did not request this, please ignore this email.</p>
                                    </td>
                                </tr>`;
    sendEmail(email, subject, buildHtml(card));
}

async function sendWelcomeEmail(email) {
    const subject = 'Welcome to Bazaar';
    const card = `<tr>
                                    <td style="padding:0 35px;">
                                        <p>Thank you for signing up with <strong>Bazaar</strong></p>
                                    </td>
                                </tr>`;
    await sendEmail(email, subject, buildHtml(card));
}

async function sendForgotPasswordEmail(email, verificationCode) {
    const subject = 'Password Reset Verification Code';
    const card = `<tr>
                                    <td style="padding:0 15px; margin-bottom:5px;">
                                        <strong style="display: block;font-size: 13px; margin: 0 0 4px; color:rgba(0,0,0,.64); font-weight:normal;">
                                            Your verification code is <strong>${verificationCode}</strong>
                                        </strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px; padding-left: 15px; padding-right: 15px;">Please note that this code is valid for the next <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
                                    </td>
                                </tr>`;
    await sendEmail(email, subject, buildHtml(card));
}

async function sendResetPasswordEmail(email) {
    const subject = 'Your Password Has Been Reset Successfully';
    const card = `<tr>
                                    <td style="padding:0 35px;">
                                        <p>We wanted to let you know that your password was successfully reset.</p>
                                        <p>If you did not perform this action, please contact our support team immediately.</p>
                                        <a href="mailto:info@bazaar-uae.com">info@bazaar-uae.com</a>
                                    </td>
                                </tr>`;
    await sendEmail(email, subject, buildHtml(card));
}

async function sendPasswordUpdateEmail(email) {
    const subject = 'Your password was successfully updated';
    const card = `<tr>
                                    <td style="padding:0 35px;">
                                        <p>We wanted to let you know that your password was successfully updated.</p>
                                        <p>If this wasn't you, please secure your account by resetting your password or contacting our support team.</p>
                                        <a href="mailto:info@bazaar-uae.com">info@bazaar-uae.com</a>
                                    </td>
                                </tr>`;
    await sendEmail(email, subject, buildHtml(card));
}

module.exports = {
    sendRecoveryEmail,
    sendWelcomeEmail,
    sendForgotPasswordEmail,
    sendResetPasswordEmail,
    sendPasswordUpdateEmail,
};
