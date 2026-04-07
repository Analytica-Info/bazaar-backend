const EmailConfig = require('../../models/EmailConfig');

exports.getEmailConfig = async (req, res) => {
    try {
        let emailConfig = await EmailConfig.findOne({ isActive: true });
        
        if (!emailConfig) {
            const adminEmail = process.env.ADMIN_EMAIL || '';
            const ccMails = process.env.CC_MAILS ? process.env.CC_MAILS.split(',').map(email => email.trim()).filter(email => email) : [];
            
            emailConfig = new EmailConfig({
                adminEmail: adminEmail,
                ccEmails: ccMails,
                isActive: true
            });
            await emailConfig.save();
        }
        
        res.status(200).json({
            success: true,
            emailConfig: emailConfig
        });
    } catch (error) {
        console.error('Get Email Config Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching email configuration.',
            error: error.message
        });
    }
};

exports.updateEmailConfig = async (req, res) => {
    try {
        const { adminEmail, ccEmails } = req.body;

        if (!adminEmail) {
            return res.status(400).json({
                success: false,
                message: 'Admin email is required'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(adminEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid admin email address'
            });
        }

        if (ccEmails && Array.isArray(ccEmails)) {
            for (const email of ccEmails) {
                if (email && !emailRegex.test(email.trim())) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid CC email: ${email}`
                    });
                }
            }
        }

        let emailConfig = await EmailConfig.findOne({ isActive: true });
        
        if (emailConfig) {
            emailConfig.adminEmail = adminEmail.toLowerCase().trim();
            emailConfig.ccEmails = ccEmails 
                ? ccEmails.map(email => email.trim().toLowerCase()).filter(email => email)
                : [];
            await emailConfig.save();
        } else {
            emailConfig = new EmailConfig({
                adminEmail: adminEmail.toLowerCase().trim(),
                ccEmails: ccEmails 
                    ? ccEmails.map(email => email.trim().toLowerCase()).filter(email => email)
                    : [],
                isActive: true
            });
            await emailConfig.save();
        }

        res.status(200).json({
            success: true,
            message: 'Email configuration updated successfully',
            emailConfig: emailConfig
        });
    } catch (error) {
        console.error('Update Email Config Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while updating email configuration.',
            error: error.message
        });
    }
};

exports.syncFromEnv = async (req, res) => {
    try {
        const adminEmail = process.env.ADMIN_EMAIL || '';
        const ccMails = process.env.CC_MAILS ? process.env.CC_MAILS.split(',').map(email => email.trim()).filter(email => email) : [];
        
        let emailConfig = await EmailConfig.findOne({ isActive: true });
        
        if (emailConfig) {
            emailConfig.adminEmail = adminEmail;
            emailConfig.ccEmails = ccMails;
            await emailConfig.save();
        } else {
            emailConfig = new EmailConfig({
                adminEmail: adminEmail,
                ccEmails: ccMails,
                isActive: true
            });
            await emailConfig.save();
        }

        res.status(200).json({
            success: true,
            message: 'Email configuration synced from environment variables successfully',
            emailConfig: emailConfig
        });
    } catch (error) {
        console.error('Sync Email Config Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while syncing email configuration.',
            error: error.message
        });
    }
};

