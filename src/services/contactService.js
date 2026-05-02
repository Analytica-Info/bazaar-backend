const contacts = require('../repositories').contacts.rawModel();
const ActivityLog = require('../repositories').activityLogs.rawModel();
const { sendEmail } = require('../mail/emailService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const logger = require("../utilities/logger");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOGO_URL = 'https://www.bazaar-uae.com/logo.png';

async function validateEmail(email) {
    try {
        const response = await axios.get('https://emailvalidation.abstractapi.com/v1/', {
            params: {
                api_key: '965f90f6ec9d48cf8fa0601caa603276',
                email,
            },
        });

        const data = response.data;

        if (data.deliverability === 'DELIVERABLE' && !data.is_disposable_email.value) {
            return { valid: true, reason: 'Email is valid and deliverable.', email };
        } else {
            return { valid: false, reason: data.deliverability, email };
        }
    } catch (error) {
        logger.error({ err: error }, 'Error validating email:');
        return { valid: false, reason: 'API request failed', email };
    }
}

// ---------------------------------------------------------------------------
// Email template helpers
// ---------------------------------------------------------------------------

function buildContactConfirmationHtml() {
    return `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                    <tr>
                        <td>
                            <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                align="center" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="height:40px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center;">
                                        <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                            <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
                                        </a>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:20px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td>
                                        <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                            <tr>
                                                <td style="height:40px;">&nbsp;</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:0 35px;">
                                                    <p>Thank you for reaching out to Bazaar E-commerce! We have received your message and will get back to you shortly. Our team is here to help with any questions or concerns you may have.</p>
                                                    <p>If you have any additional information to share, feel free to reply to this email.</p>
                                                    <p>We look forward to connecting with you soon!</p>
                                                    <br>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="height:40px;">&nbsp;</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:20px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center;">
                                        <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:80px;">&nbsp;</td>
                                </tr>
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
                                <tr>
                                    <td style="height:40px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center;">
                                        <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                            <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
                                        </a>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:20px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td>
                                        <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                            style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                            <tr>
                                                <td style="height:40px;">&nbsp;</td>
                                            </tr>
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
                                            <tr>
                                                <td style="height:40px;">&nbsp;</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:20px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center;">
                                        <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:80px;">&nbsp;</td>
                                </tr>
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
                                <tr>
                                    <td style="height:40px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center;">
                                        <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                            <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
                                        </a>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:20px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td>
                                        <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                            <tr>
                                                <td style="height:40px;">&nbsp;</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:0 35px;">
                                                    <p>Thank you for sharing your feedback with Bazaar E-commerce! We have received your message and appreciate you taking the time to help us improve.</p>
                                                    <p>If you have any additional thoughts to share, feel free to submit again or contact us.</p>
                                                    <p>We look forward to serving you better!</p>
                                                    <br>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="height:40px;">&nbsp;</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:20px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center;">
                                        <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:80px;">&nbsp;</td>
                                </tr>
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
                                <tr>
                                    <td style="height:40px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center;">
                                        <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                            <img width="110" src="${LOGO_URL}" title="logo" alt="logo">
                                        </a>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:20px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td>
                                        <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                            style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                            <tr>
                                                <td style="height:40px;">&nbsp;</td>
                                            </tr>
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
                                            <tr>
                                                <td style="height:40px;">&nbsp;</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:20px;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="text-align:center;">
                                        <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:80px;">&nbsp;</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>`;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Submit a contact form: validate email, send confirmation + admin notification, save to DB.
 * @returns {string} Success message.
 */
async function submitContactForm({ email, name, subject, message, phone }) {
    if (!name) {
        throw { status: 400, message: 'Name is required' };
    }
    if (!email) {
        throw { status: 400, message: 'Email is required' };
    }
    if (!phone) {
        throw { status: 400, message: 'Phone is required' };
    }
    if (!subject) {
        throw { status: 400, message: 'Subject is required' };
    }
    if (!message) {
        throw { status: 400, message: 'Message is required' };
    }

    const result = await validateEmail(email);
    if (!result.valid) {
        throw {
            status: 400,
            message: 'The email address you provided is not valid. Please enter a valid email address.',
        };
    }

    const adminEmail = process.env.ADMIN_EMAIL;

    const emailSubject = 'Thank You for Contacting Bazaar E-Commerce!';
    const html = buildContactConfirmationHtml();

    const adminSubject = 'New Contact Us Submission - Bazaar Bazaar E-Commerce';
    const adminHtml = buildContactAdminNotificationHtml({ name, phone, email, message });

    await sendEmail(email, emailSubject, html);
    await sendEmail(adminEmail, adminSubject, adminHtml);

    await contacts.create({ email, name, subject, message, phone });

    return 'Thank you for reaching out to Bazaar E-Commerce! We have received your message and will get back to you shortly.';
}

/**
 * Submit feedback from the mobile app.
 * @returns {string} Success message.
 */
async function submitFeedback({ name, feedback, userEmail }) {
    if (!name) {
        throw { status: 400, message: 'Name is required' };
    }
    if (!feedback) {
        throw { status: 400, message: 'Feedback is required' };
    }
    if (!userEmail) {
        throw { status: 400, message: 'User email not found. Please log in again.' };
    }

    const adminEmail = process.env.ADMIN_EMAIL;

    const userSubject = 'Thank You for Your Feedback - Bazaar E-Commerce!';
    const userHtml = buildFeedbackConfirmationHtml();

    const adminSubject = 'New Feedback Submission - Bazaar E-Commerce (Mobile App)';
    const adminHtml = buildFeedbackAdminNotificationHtml({ name, userEmail, feedback });

    await sendEmail(userEmail, userSubject, userHtml);
    await sendEmail(adminEmail, adminSubject, adminHtml);

    return 'Thank you for your feedback. We have received it and will review it shortly.';
}

/**
 * Validate and resolve a file path for download.
 * @param {string} relativePath - The relative file path from the request.
 * @param {string} uploadsDir - The absolute path to the uploads directory.
 * @returns {string} The validated full file path.
 */
function downloadFile(relativePath, uploadsDir) {
    if (!relativePath) {
        throw { status: 400, message: 'Missing file path.' };
    }

    const cleanedRelativePath = relativePath.replace(/^\/?uploads\/?/, '');
    const fullPath = path.normalize(path.join(uploadsDir, cleanedRelativePath));

    if (!fullPath.startsWith(uploadsDir)) {
        throw { status: 403, message: 'Access denied.' };
    }

    if (!fs.existsSync(fullPath)) {
        throw { status: 404, message: 'File not found.' };
    }

    return fullPath;
}

/**
 * Create a mobile app activity log entry.
 * @param {Object} data - Log data fields.
 * @returns {{ logId: string }}
 */
async function createMobileAppLog(data) {
    const { user_name, mobile_device, app_version, email, issue_message, activity_name } = data;

    if (!user_name) {
        throw { status: 400, message: 'User name is required' };
    }
    if (!mobile_device) {
        throw { status: 400, message: 'Mobile device is required' };
    }
    if (!app_version) {
        throw { status: 400, message: 'App version is required' };
    }
    if (!email) {
        throw { status: 400, message: 'Email is required' };
    }
    if (!issue_message) {
        throw { status: 400, message: 'Issue/Message is required' };
    }

    const dubaiDate = new Date().toLocaleString('en-GB', {
        timeZone: 'Asia/Dubai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const logEntry = await ActivityLog.create({
        platform: 'Mobile App Frontend',
        log_type: 'frontend_log',
        action: activity_name || 'User Issue/Message',
        status: 'success',
        message: `Mobile app log from ${user_name}`,
        user_name,
        user_email: email,
        mobile_device,
        app_version,
        issue_message,
        timestamp: new Date(),
        details: {
            mobile_device,
            app_version,
            issue_message,
            activity_name: activity_name || 'User Issue/Message',
            dubai_datetime: dubaiDate,
        },
    });

    return { logId: logEntry._id };
}

module.exports = {
    submitContactForm,
    submitFeedback,
    downloadFile,
    createMobileAppLog,
};
