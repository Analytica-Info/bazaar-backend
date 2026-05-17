'use strict';

/**
 * emailShell.js — shared Bazaar branded shell for transactional emails.
 *
 * Every "card-on-grey" Bazaar email (auth recovery, password reset,
 * welcome, verticals notify-me, vertical launch blast, etc.) wraps its
 * content in the same chrome: grey page background, centered logo
 * header, white card with subtle shadow, "© bazaar-uae.com" footer.
 *
 * Callers compose the card *content* (one or more <tr><td>… inner
 * blocks) and call `buildHtml(cardContent)` to get a complete <body>
 * HTML string ready for sendEmail().
 *
 * Domain template files (src/services/{auth,verticals}/domain/
 * emailTemplates.js) import { buildHtml, LOGO_URL } from here so the
 * shell is defined once and only once.
 *
 * Out of scope: src/services/{order,contact}/domain/emailTemplates.js
 * use inlined full-page HTML per template with a slightly different
 * shell (extra body padding). Consolidating those is a separate task —
 * each of their templates is structured around order/contact-specific
 * tables interleaved with the shell at multiple nesting levels.
 */

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

/**
 * Wrap card-level content in the shared Bazaar branded shell.
 *
 * @param {string} cardContent — one or more `<tr><td>…</td></tr>` blocks
 *                               that render inside the white card.
 * @returns {string} Complete HTML body ready for sendEmail().
 */
function buildHtml(cardContent) {
    return TABLE_WRAPPER_OPEN + CARD_OPEN + cardContent + CARD_CLOSE + TABLE_WRAPPER_CLOSE;
}

module.exports = {
    LOGO_URL,
    TABLE_WRAPPER_OPEN,
    TABLE_WRAPPER_CLOSE,
    CARD_OPEN,
    CARD_CLOSE,
    buildHtml,
};
