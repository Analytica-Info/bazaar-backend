'use strict';

const ActivityLog = require('../../../repositories').activityLogs.rawModel();
const { escapeRegex } = require('../../../utilities/stringUtils');

module.exports = async function getActivityLogs({ page, limit, search, platform, status }) {
    page  = parseInt(page)  || 1;
    limit = parseInt(limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};

    if (platform) query.platform = platform;
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
        .skip(skip)
        .limit(limit)
        .lean();

    const totalCount = await ActivityLog.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    return {
        logs,
        pagination: { currentPage: page, totalPages, totalCount, limit }
    };
};
