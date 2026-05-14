'use strict';

const ActivityLog = require('../../../repositories').activityLogs.rawModel();
const { escapeRegex } = require('../../../utilities/stringUtils');

module.exports = async function downloadActivityLogs(filters) {
    const { platform, log_type, status, search } = filters;

    const query = {};
    if (platform) query.platform = platform;
    if (log_type) query.log_type = log_type;
    if (status)   query.status   = status;
    if (search) {
        const safeSearch = escapeRegex(search);
        query.$or = [
            { message:       { $regex: safeSearch, $options: 'i' } },
            { user_name:     { $regex: safeSearch, $options: 'i' } },
            { user_email:    { $regex: safeSearch, $options: 'i' } },
            { order_id:      { $regex: safeSearch, $options: 'i' } },
            { issue_message: { $regex: safeSearch, $options: 'i' } }
        ];
    }

    const logs = await ActivityLog.find(query)
        .sort({ timestamp: -1 })
        .limit(10000)
        .lean();

    // NOTE: textContent is built but intentionally not returned (original behaviour preserved).
    let textContent = 'ACTIVITY LOGS EXPORT (Mobile App Frontend)\n';
    textContent += '='.repeat(50) + '\n\n';

    logs.forEach((log, index) => {
        textContent += `[${index + 1}] Log Entry\n`;
        textContent += `Platform: ${log.platform}\n`;
        textContent += `Type: ${log.log_type}\n`;
        textContent += `Action: ${log.action}\n`;
        textContent += `Status: ${log.status.toUpperCase()}\n`;
        textContent += `Message: ${log.message}\n`;
        if (log.user_name)     textContent += `User: ${log.user_name}\n`;
        if (log.user_email)    textContent += `Email: ${log.user_email}\n`;
        if (log.mobile_device) textContent += `Device: ${log.mobile_device}\n`;
        if (log.app_version)   textContent += `App Version: ${log.app_version}\n`;
        if (log.issue_message) textContent += `Issue: ${log.issue_message}\n`;
        if (log.order_id)      textContent += `Order ID: ${log.order_id}\n`;
        if (log.error_details) textContent += `Error: ${log.error_details}\n`;
        textContent += `Time: ${new Date(log.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}\n`;
        textContent += '\n' + '-'.repeat(50) + '\n\n';
    });

    return logs;
};
