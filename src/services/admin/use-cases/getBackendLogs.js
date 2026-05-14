'use strict';

const BackendLog = require('../../../repositories').backendLogs.rawModel();

module.exports = async function getBackendLogs({ page, limit, date, platform, search }) {
    page  = parseInt(page)  || 1;
    limit = parseInt(limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (platform) query.platform = platform;
    if (date)     query.date     = date;

    const logs = await BackendLog.find(query)
        .sort({ date: -1, platform: 1 })
        .skip(skip)
        .limit(limit)
        .lean();

    let filteredLogs = logs;
    if (search) {
        filteredLogs = logs.map(log => {
            const filteredActivities = log.activities.filter(activity =>
                activity.activity_name.toLowerCase().includes(search.toLowerCase()) ||
                activity.message.toLowerCase().includes(search.toLowerCase()) ||
                (activity.order_id      && activity.order_id.toLowerCase().includes(search.toLowerCase())) ||
                (activity.product_name  && activity.product_name.toLowerCase().includes(search.toLowerCase()))
            );
            return {
                ...log,
                activities:       filteredActivities,
                total_activities: filteredActivities.length,
                success_count:    filteredActivities.filter(a => a.status === 'success').length,
                failure_count:    filteredActivities.filter(a => a.status === 'failure').length
            };
        }).filter(log => log.activities.length > 0);
    }

    const totalCount = await BackendLog.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    return {
        logs: filteredLogs,
        pagination: { currentPage: page, totalPages, totalCount, limit }
    };
};
