const emailConfigService = require("../../services/emailConfigService");

exports.getEmailConfig = async (req, res) => {
    try {
        const emailConfig = await emailConfigService.getEmailConfig();
        res.status(200).json({ success: true, emailConfig });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
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
        const emailConfig = await emailConfigService.updateEmailConfig({ adminEmail, ccEmails });
        res.status(200).json({
            success: true,
            message: 'Email configuration updated successfully',
            emailConfig
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
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
        const emailConfig = await emailConfigService.syncFromEnv();
        res.status(200).json({
            success: true,
            message: 'Email configuration synced from environment variables successfully',
            emailConfig
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        console.error('Sync Email Config Error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while syncing email configuration.',
            error: error.message
        });
    }
};
