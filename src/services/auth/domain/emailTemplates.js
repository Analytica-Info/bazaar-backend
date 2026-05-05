'use strict';

/**
 * emailTemplates.js — auth-related email sending helpers.
 *
 * Each function builds an HTML template and calls sendEmail.
 * Kept together because all templates share the same branding shell.
 */

const { sendEmail } = require('../../../mail/emailService');

const LOGO_URL = 'https://www.bazaar-uae.com/logo.png';
const TABLE_WRAPPER_OPEN = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>`;

const TABLE_WRAPPER_CLOSE = `                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr><td style="height:80px;">&nbsp;</td></tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>`;

const CARD_OPEN = `<tr>
                            <td>
                                <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                    style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                    <tr><td style="height:40px;">&nbsp;</td></tr>`;

const CARD_CLOSE = `                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                </table>
                            </td>
                        </tr>`;

function buildHtml(cardContent) {
    return TABLE_WRAPPER_OPEN + CARD_OPEN + cardContent + CARD_CLOSE + TABLE_WRAPPER_CLOSE;
}

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
