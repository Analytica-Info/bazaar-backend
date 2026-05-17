'use strict';

const BackendLog = require('../../../repositories').backendLogs.rawModel();

module.exports = async function downloadBackendLogs(filters) {
    const { date, platform } = filters;

    const query = {};
    if (date)     query.date     = date;
    if (platform) query.platform = platform;

    const logs = await BackendLog.find(query)
        .sort({ date: -1, platform: 1 })
        .lean();

    // NOTE: textContent is built but intentionally not returned (original behaviour preserved).
    let textContent = 'BACKEND LOGS EXPORT\n';
    textContent += '='.repeat(50) + '\n\n';

    logs.forEach(log => {
        textContent += `Date: ${log.date}\n`;
        textContent += `Platform: ${log.platform}\n`;
        textContent += `Total Activities: ${log.total_activities}\n`;
        textContent += `Success: ${log.success_count} | Failure: ${log.failure_count}\n`;
        textContent += '-'.repeat(50) + '\n';

        log.activities.forEach((activity, index) => {
            textContent += `\n[${index + 1}] ${activity.activity_name}\n`;
            textContent += `Status: ${activity.status.toUpperCase()}\n`;
            textContent += `Message: ${activity.message}\n`;
            if (activity.order_id)       textContent += `Order ID: ${activity.order_id}\n`;
            if (activity.product_name)   textContent += `Product: ${activity.product_name}\n`;
            if (activity.execution_path) textContent += `Execution: ${activity.execution_path}\n`;
            if (activity.error_details)  textContent += `Error: ${activity.error_details}\n`;
            textContent += `Time: ${new Date(activity.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}\n`;
            textContent += '\n';
        });

        textContent += '\n' + '='.repeat(50) + '\n\n';
    });

    return logs;
};
