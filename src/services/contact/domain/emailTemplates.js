'use strict';

const LOGO_URL = 'https://www.bazaar-uae.com/logo.png';

function buildContactConfirmationHtml() {
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
                                            <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
                                        </a>
                                    </td>
                                </tr>
                                <tr><td style="height:20px;">&nbsp;</td></tr>
                                <tr>
                                    <td>
                                        <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                            <tr><td style="height:40px;">&nbsp;</td></tr>
                                            <tr>
                                                <td style="padding:0 35px;">
                                                    <p>Thank you for reaching out to Bazaar E-commerce! We have received your message and will get back to you shortly. Our team is here to help with any questions or concerns you may have.</p>
                                                    <p>If you have any additional information to share, feel free to reply to this email.</p>
                                                    <p>We look forward to connecting with you soon!</p>
                                                    <br>
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

function buildContactAdminNotificationHtml({ name, phone, email, message }) {
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
                                            <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
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
                                                    <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Dear Bazaar E-Commerce Team,</b></h6>
                                                    <p style="color:#455056; font-size:16px; display: block; margin: 10px 4px 0px 0px; color:rgba(0,0,0,.64); font-weight: 500;">
                                                        A new inquiry has been submitted via the Contact Us form on Bazaar E-commerce.
                                                    </p>
                                                    <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                    <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Name <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${name}</p></p>
                                                    <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Phone <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${phone}</p></p>
                                                    <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Email <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${email}</p></p>
                                                    <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Message <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${message}</p></p>
                                                    <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                    <div margin-bottom:5px;">
                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">Please follow up with the user as soon as possible. You can view more details in the admin dashboard.</p>
                                                    </div>
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

function buildFeedbackConfirmationHtml() {
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
                                            <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
                                        </a>
                                    </td>
                                </tr>
                                <tr><td style="height:20px;">&nbsp;</td></tr>
                                <tr>
                                    <td>
                                        <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                            <tr><td style="height:40px;">&nbsp;</td></tr>
                                            <tr>
                                                <td style="padding:0 35px;">
                                                    <p>Thank you for sharing your feedback with Bazaar E-commerce! We have received your message and appreciate you taking the time to help us improve.</p>
                                                    <p>If you have any additional thoughts to share, feel free to submit again or contact us.</p>
                                                    <p>We look forward to serving you better!</p>
                                                    <br>
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

function buildFeedbackAdminNotificationHtml({ name, userEmail, feedback }) {
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
                                            <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
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
                                                    <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Dear Bazaar E-Commerce Team,</b></h6>
                                                    <p style="color:#455056; font-size:16px; display: block; margin: 10px 4px 0px 0px; color:rgba(0,0,0,.64); font-weight: 500;">
                                                        A new feedback has been submitted via the Mobile App.
                                                    </p>
                                                    <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                    <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Name <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${name}</p></p>
                                                    <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Email <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${userEmail}</p></p>
                                                    <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Feedback <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${feedback}</p></p>
                                                    <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                    <div margin-bottom:5px;">
                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">Please follow up with the user if needed.</p>
                                                    </div>
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

module.exports = {
  buildContactConfirmationHtml,
  buildContactAdminNotificationHtml,
  buildFeedbackConfirmationHtml,
  buildFeedbackAdminNotificationHtml,
};
