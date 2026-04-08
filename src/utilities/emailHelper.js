const EmailConfig = require('../models/EmailConfig');

const logger = require("./logger");
/**
 * Get admin email - checks database first, then falls back to ENV
 * @returns {Promise<string>} Admin email address
 */
async function getAdminEmail() {
    try {
        const emailConfig = await EmailConfig.findOne({ isActive: true });
        if (emailConfig && emailConfig.adminEmail) {
            return emailConfig.adminEmail;
        }
    } catch (error) {
        logger.error({ err: error }, 'Error fetching admin email from database:');
    }

    return process.env.ADMIN_EMAIL || '';
}

/**
 * Get CC emails - checks database first, then falls back to ENV
 * @returns {Promise<string[]>} Array of CC email addresses
 */
async function getCcEmails() {
    try {
        const emailConfig = await EmailConfig.findOne({ isActive: true });
        if (emailConfig && emailConfig.ccEmails && emailConfig.ccEmails.length > 0) {
            return emailConfig.ccEmails.filter(email => email && email.trim());
        }
    } catch (error) {
        logger.error({ err: error }, 'Error fetching CC emails from database:');
    }

    const ccMails = process.env.CC_MAILS;
    if (ccMails) {
        return ccMails.split(',').map(email => email.trim()).filter(email => email);
    }

    return [];
}

module.exports = {
    getAdminEmail,
    getCcEmails
};
