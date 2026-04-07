const contacts = require("../../models/Contact");
const { sendEmail } = require('../../mail/emailService');
const axios = require('axios');
const BACKEND_URL = process.env.BACKEND_URL;
const fs = require('fs');
const path = require('path');
const ActivityLog = require('../../models/ActivityLog');

exports.contactUs = async (req, res) => {
    try {
        const { email, name, subject, message, phone } = req.body;
    
        if (!name) {
            return res.status(400).json({ message: "Name is required" });
        }
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        if (!phone) {
            return res.status(400).json({ message: "Phone is required" });
        }
        if (!subject) {
            return res.status(400).json({ message: "Subject is required" });
        }
        if (!message) {
            return res.status(400).json({ message: "Message is required" });
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        const logoUrl = "https://www.bazaar-uae.com/logo.png";
    
        const emailSubject = `Thank You for Contacting Bazaar E-Commerce!`;
        const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
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
    
        const adminSubject = "New Contact Us Submission - Bazaar Bazaar E-Commerce";
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

        const result = await validateEmail(email);
        if (!result.valid) {
            return res.status(400).json({
                message: `The email address you provided is not valid. Please enter a valid email address.`,
            });
        }

        await sendEmail(email, emailSubject, html);
        await sendEmail(adminEmail, adminSubject, adminHtml);
        await contacts.create({
            email, 
            name, 
            subject,
            message, 
            phone,   
        });
        res.status(200).json({
            message: `Thank you for reaching out to Bazaar E-Commerce! We have received your message and will get back to you shortly.`,
        });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
};

exports.submitFeedback = async (req, res) => {
    try {
        const { name, feedback } = req.body;
        const userEmail = req.user?.email;

        if (!name) {
            return res.status(400).json({ message: "Name is required" });
        }
        if (!feedback) {
            return res.status(400).json({ message: "Feedback is required" });
        }
        if (!userEmail) {
            return res.status(400).json({ message: "User email not found. Please log in again." });
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        const logoUrl = "https://www.bazaar-uae.com/logo.png";

        const userSubject = "Thank You for Your Feedback - Bazaar E-Commerce!";
        const userHtml = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
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

        const adminSubject = "New Feedback Submission - Bazaar E-Commerce (Mobile App)";
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

        await sendEmail(userEmail, userSubject, userHtml);
        await sendEmail(adminEmail, adminSubject, adminHtml);

        res.status(200).json({
            message: "Thank you for your feedback. We have received it and will review it shortly.",
        });
    } catch (error) {
        console.error("Feedback submission error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.downloadFile = async (req, res) => {
    const relativePath = req.query.url;
  
    if (!relativePath) {
        return res.status(400).send("Missing file path.");
    }
  
    const uploadsDir = path.join(__dirname, '../../uploads');
  
    const cleanedRelativePath = relativePath.replace(/^\/?uploads\/?/, '');
    const fullPath = path.normalize(path.join(uploadsDir, cleanedRelativePath));
  
  
    if (!fullPath.startsWith(uploadsDir)) {
        return res.status(403).send("Access denied.");
    }
  
    if (!fs.existsSync(fullPath)) {
        return res.status(404).send("File not found.");
    }
  
    res.download(fullPath, (err) => {
        if (err) {
            console.error("Download error:", err);
            res.status(500).send("Failed to download file.");
        }
    });
};

const validateEmail = async (email) => {
    try {
        const response = await axios.get('https://emailvalidation.abstractapi.com/v1/', {
            params: {
                api_key: '965f90f6ec9d48cf8fa0601caa603276',
                email: email
            }
        });

        const data = response.data;

        if (data.deliverability === 'DELIVERABLE' && !data.is_disposable_email.value) {
            return { valid: true, reason: 'Email is valid and deliverable.', email: email };
        } else {
            return { valid: false, reason: data.deliverability, email: email };
        }
    } catch (error) {
        console.error('Error validating email:', error.message);
        return { valid: false, reason: 'API request failed', email: email };
    }
};

exports.createMobileAppLog = async (req, res) => {
    try {
        const { user_name, mobile_device, app_version, email, issue_message, activity_name } = req.body;

        if (!user_name) {
            return res.status(400).json({ message: "User name is required" });
        }
        if (!mobile_device) {
            return res.status(400).json({ message: "Mobile device is required" });
        }
        if (!app_version) {
            return res.status(400).json({ message: "App version is required" });
        }
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        if (!issue_message) {
            return res.status(400).json({ message: "Issue/Message is required" });
        }

        const dubaiDate = new Date().toLocaleString("en-GB", {
            timeZone: "Asia/Dubai",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
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
                dubai_datetime: dubaiDate
            }
        });

        res.status(200).json({
            success: true,
            message: "Log created successfully",
            log_id: logEntry._id
        });
    } catch (error) {
        console.error('Error creating mobile app log:', error);
        res.status(500).json({ 
            success: false,
            message: "Server error",
            error: error.message 
        });
    }
};