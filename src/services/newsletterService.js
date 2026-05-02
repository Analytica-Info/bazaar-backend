const NewsLetter = require('../repositories').newsletters.rawModel();
const { sendEmail } = require("../mail/emailService");
const { getAdminEmail } = require("../utilities/emailHelper");
const axios = require("axios");
const nodemailer = require("nodemailer");
const async = require("async");

const logger = require("../utilities/logger");
const WEBURL = process.env.URL;

// ─── Exported Functions ──────────────────────────────────────────

/**
 * Subscribe to newsletter — validate email, verify reCAPTCHA, save
 * @param {string} email
 * @param {string} recaptchaToken
 */
exports.subscribe = async (email, recaptchaToken) => {
  try {
    // Validate email
    if (!email) {
      throw { status: 400, message: "Email is required" };
    }

    // Validate reCAPTCHA token
    if (!recaptchaToken) {
      throw {
        status: 400,
        message: "reCAPTCHA verification is required",
      };
    }

    // Verify reCAPTCHA token with Google
    const RECAPTCHA_API_KEY = process.env.RECAPTCHA_API_KEY;
    const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

    if (!RECAPTCHA_API_KEY || !PROJECT_ID) {
      console.error(
        "reCAPTCHA Enterprise credentials are not configured"
      );
      throw { status: 500, message: "Server configuration error" };
    }

    try {
      const recaptchaResponse = await axios.post(
        `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${RECAPTCHA_API_KEY}`,
        {
          event: {
            token: recaptchaToken,
            expectedAction: "newsletter_subscribe",
            siteKey: process.env.RECAPTCHA_SITE_KEY,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("reCAPTCHA Enterprise verification result:", {
        tokenValid:
          recaptchaResponse.data.tokenProperties?.valid,
        score: recaptchaResponse.data.riskAnalysis?.score,
        action:
          recaptchaResponse.data.tokenProperties?.action,
        reasons:
          recaptchaResponse.data.riskAnalysis?.reasons,
      });

      // Check if token is valid
      if (!recaptchaResponse.data.tokenProperties?.valid) {
        console.error(
          "reCAPTCHA token is invalid:",
          recaptchaResponse.data.tokenProperties?.invalidReason
        );
        throw {
          status: 403,
          message:
            "Security verification failed. Please try again.",
        };
      }

      // Check if the action matches
      if (
        recaptchaResponse.data.tokenProperties?.action !==
        "newsletter_subscribe"
      ) {
        console.error(
          "Invalid reCAPTCHA action:",
          recaptchaResponse.data.tokenProperties?.action
        );
        throw {
          status: 403,
          message: "Invalid verification action",
        };
      }

      // Check the risk score
      const score =
        recaptchaResponse.data.riskAnalysis?.score || 0;
      const MINIMUM_SCORE = 0.5;

      if (score < MINIMUM_SCORE) {
        console.warn(
          `Low reCAPTCHA score detected: ${score} (minimum: ${MINIMUM_SCORE})`
        );
        throw {
          status: 403,
          message:
            "Suspicious activity detected. Please try again later.",
        };
      }

      console.log(
        `reCAPTCHA verification passed with score: ${score}`
      );
    } catch (recaptchaError) {
      if (recaptchaError.status) throw recaptchaError;
      console.error(
        "Error verifying reCAPTCHA:",
        recaptchaError.response?.data || recaptchaError.message
      );
      throw {
        status: 500,
        message:
          "Failed to verify security check. Please try again.",
      };
    }

    const existingSubscription = await NewsLetter.findOne({ email });

    if (existingSubscription) {
      throw {
        status: 400,
        message: "You are already subscribed to the newsletter",
      };
    }

    const newNewsLetter = new NewsLetter({
      email,
    });

    const adminEmail = await getAdminEmail();
    const logoUrl = `${WEBURL}/images/logo.png`;

    const subject = `Welcome to Bazaar Newsletter - Subscription Successful!`;
    const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                            <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                                style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
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
                                                        <img width="110" src="${logoUrl}" title="logo" alt="logo">
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
                                                                <p>Thank you for subscribing to the Bazaar newsletter! We're delighted to have you join our community. You'll receive updates, special offers, and cheesy tips directly in your inbox. Stay tuned for the latest news and some cheesy goodness coming your way!</p>
                                                                <p>If you have any questions, feel free to reach out to us. We're here to help!</p>
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

    const adminSubject = "New Newsletter Subscription - Bazaar";
    const adminHtml = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
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
                                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
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

    await sendEmail(email, subject, html);
    await sendEmail(adminEmail, adminSubject, adminHtml);

    await newNewsLetter.save();

    return {
      message: `Thank you for subscribing to the Bazaar newsletter!.`,
    };
  } catch (error) {
    if (error.status) throw error;
    throw { status: 500, message: "Server error" };
  }
};

/**
 * Return all subscribers
 */
exports.getSubscribers = async () => {
  try {
    const newsLetters = await NewsLetter.find();
    return newsLetters;
  } catch (error) {
    console.error(error);
    throw { status: 500, message: error.message };
  }
};

/**
 * Send bulk emails via nodemailer
 * @param {Object} params - { emails (to array), subject, htmlContent, cc, bcc }
 */
exports.sendBulkEmails = async ({ emails, subject, htmlContent, cc, bcc }) => {
  if (!emails || !subject || !htmlContent) {
    throw { status: 400, message: "Missing required fields" };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const allRecipients = [...emails, ...(cc || []), ...(bcc || [])];

  return new Promise((resolve, reject) => {
    async.eachLimit(
      allRecipients,
      10,
      (recipient, callback) => {
        const mailOptions = {
          from: process.env.EMAIL_USERNAME,
          to: recipient,
          cc: cc,
          bcc: bcc,
          subject: subject,
          html: htmlContent,
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error(
              `Error sending email to ${recipient}:`,
              error
            );
          } else {
            console.log(
              `Email sent to ${recipient}:`,
              info.response
            );
          }
          callback();
        });
      },
      (err) => {
        transporter.close();
        if (err) {
          logger.error({ err: err }, "Error in bulk email sending:");
          reject({
            status: 500,
            message: "Failed to send emails",
          });
        } else {
          logger.info("Bulk email sending completed");
          resolve({
            message: "Emails sent successfully",
          });
        }
      }
    );
  });
};
