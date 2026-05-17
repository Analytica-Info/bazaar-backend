'use strict';

const NewsLetter = require('../../../repositories').newsletters.rawModel();
const { sendEmail } = require('../../../mail/emailService');
const { getAdminEmail } = require('../../../utilities/emailHelper');
const { verifyRecaptcha } = require('../adapters/recaptchaVerifier');

const WEBURL = process.env.URL;

function buildSubscriberConfirmationHtml(logoUrl) {
  return `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr><td style="height:40px;">&nbsp;</td></tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <p>Thank you for subscribing to the Bazaar newsletter! We're delighted to have you join our community. You'll receive updates, special offers, and cheesy tips directly in your inbox. Stay tuned for the latest news and some cheesy goodness coming your way!</p>
                                                        <p>If you have any questions, feel free to reach out to us. We're here to help!</p>
                                                    </td>
                                                </tr>
                                                <tr><td style="height:40px;">&nbsp;</td></tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr><td style="height:20px;">&nbsp;</td></tr>
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
}

function buildAdminNotificationHtml(email, logoUrl) {
  return `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                        <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                            <tr>
                                <td>
                                    <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                        align="center" cellpadding="0" cellspacing="0">
                                        <tr><td style="height:40px;">&nbsp;</td></tr>
                                        <tr>
                                            <td style="text-align:center;">
                                                <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                    <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                                </a>
                                            </td>
                                        </tr>
                                        <tr><td style="height:20px;">&nbsp;</td></tr>
                                        <tr>
                                            <td>
                                                <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                    style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                                    <tr>
                                                        <td style="padding:0 35px;">
                                                            <br>
                                                            <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Dear Bazaar Team,</b></h6>
                                                            <p style="color:#455056; font-size:16px; display: block; margin: 10px 4px 0px 0px; color:rgba(0,0,0,.64); font-weight: 500;">
                                                                A new user has subscribed to the Bazaar newsletter
                                                            </p>
                                                            <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                            <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Email <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${email}</p></p>
                                                            <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                            <br>
                                                            <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">Please check the admin dashboard for more details about the subscriber.</p>
                                                        </td>
                                                    </tr>
                                                    <tr><td style="height:40px;">&nbsp;</td></tr>
                                                </table>
                                            </td>
                                        </tr>
                                        <tr><td style="height:20px;">&nbsp;</td></tr>
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
}

/**
 * Subscribe to newsletter — validate email, verify reCAPTCHA, save.
 * @param {string} email
 * @param {string} recaptchaToken
 */
async function subscribe(email, recaptchaToken) {
  try {
    if (!email) {
      throw { status: 400, message: 'Email is required' };
    }

    if (!recaptchaToken) {
      throw { status: 400, message: 'reCAPTCHA verification is required' };
    }

    await verifyRecaptcha(recaptchaToken, 'newsletter_subscribe');

    const existingSubscription = await NewsLetter.findOne({ email });
    if (existingSubscription) {
      throw { status: 400, message: 'You are already subscribed to the newsletter' };
    }

    const newNewsLetter = new NewsLetter({ email });

    const adminEmail = await getAdminEmail();
    const logoUrl = `${WEBURL}/images/logo.png`;

    await sendEmail(email, 'Welcome to Bazaar Newsletter - Subscription Successful!', buildSubscriberConfirmationHtml(logoUrl));
    await sendEmail(adminEmail, 'New Newsletter Subscription - Bazaar', buildAdminNotificationHtml(email, logoUrl));

    await newNewsLetter.save();

    return { message: 'Thank you for subscribing to the Bazaar newsletter!.' };
  } catch (error) {
    if (error.status) throw error;
    throw { status: 500, message: 'Server error' };
  }
}

module.exports = { subscribe };
