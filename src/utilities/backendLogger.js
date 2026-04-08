const BackendLog = require('../models/BackendLog');

const logger = require("/logger");
/**
 * Helper function to log backend activities (grouped by date)
 * @param {Object} logData - Log data object
 * @param {String} logData.platform - 'Mobile App Backend' | 'Website Backend'
 * @param {String} logData.activity_name - Activity name (e.g., 'Inventory Update', 'Order Creation')
 * @param {String} logData.status - 'success' | 'failure'
 * @param {String} logData.message - Short message
 * @param {String} logData.order_id - Order ID if applicable
 * @param {String} logData.product_id - Product ID if applicable
 * @param {String} logData.product_name - Product name if applicable
 * @param {String} logData.execution_path - Where the activity executed (file/function name)
 * @param {String} logData.error_details - Error details if status is failure
 */
async function logBackendActivity(logData) {
    try {
        const {
            platform,
            activity_name,
            status,
            message,
            order_id = null,
            product_id = null,
            product_name = null,
            execution_path = null,
            error_details = null
        } = logData;

        const dubaiDate = new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Dubai"
        });

        let logEntry = await BackendLog.findOne({
            date: dubaiDate,
            platform: platform
        });

        const activityData = {
            activity_name,
            status,
            message,
            order_id,
            product_id,
            product_name,
            execution_path,
            timestamp: new Date(),
            error_details: status === 'failure' ? error_details : null
        };

        if (logEntry) {
            logEntry.activities.push(activityData);
            logEntry.total_activities += 1;
            if (status === 'success') {
                logEntry.success_count += 1;
            } else {
                logEntry.failure_count += 1;
            }
            await logEntry.save();
        } else {
            logEntry = await BackendLog.create({
                date: dubaiDate,
                platform: platform,
                activities: [activityData],
                total_activities: 1,
                success_count: status === 'success' ? 1 : 0,
                failure_count: status === 'failure' ? 1 : 0
            });
        }
    } catch (error) {
        logger.error({ err: error }, 'Error logging backend activity:');
    }
}

module.exports = { logBackendActivity };
