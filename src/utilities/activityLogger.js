const ActivityLog = require('../models/ActivityLog');

const logger = require("/logger");
/**
 * Helper function to log activities
 * @param {Object} logData - Log data object
 * @param {String} logData.platform - 'Mobile App Frontend' | 'Mobile App Backend' | 'Website Backend'
 * @param {String} logData.log_type - 'frontend_log' | 'backend_activity'
 * @param {String} logData.action - Action name (e.g., 'Order Creation', 'Email Sending')
 * @param {String} logData.status - 'success' | 'failure'
 * @param {String} logData.message - Log message
 * @param {Object} logData.user - User object with _id, name, email
 * @param {Object} logData.details - Additional details object
 */
async function logActivity(logData) {
    try {
        const {
            platform,
            log_type,
            action,
            status,
            message,
            user = null,
            details = {}
        } = logData;

        const logEntry = {
            platform,
            log_type,
            action,
            status,
            message,
            user_id: user?._id || user?.userId || null,
            user_name: user?.name || user?.first_name || null,
            user_email: user?.email || null,
            details,
            timestamp: new Date()
        };

        if (log_type === 'frontend_log') {
            logEntry.mobile_device = details.mobile_device || null;
            logEntry.app_version = details.app_version || null;
            logEntry.issue_message = details.issue_message || null;
        } else if (log_type === 'backend_activity') {
            logEntry.order_id = details.order_id || null;
            logEntry.item_id = details.item_id || null;
            if (status === 'failure') {
                logEntry.error_details = details.error_details || message;
            }
        }

        await ActivityLog.create(logEntry);
    } catch (error) {
        logger.error({ err: error }, 'Error logging activity:');
    }
}

module.exports = { logActivity };
