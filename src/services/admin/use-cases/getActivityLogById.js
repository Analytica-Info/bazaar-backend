'use strict';

const mongoose    = require('mongoose');
const ActivityLog = require('../../../repositories').activityLogs.rawModel();

module.exports = async function getActivityLogById(logId) {
    if (!mongoose.Types.ObjectId.isValid(logId)) {
        throw { status: 400, message: 'Invalid log ID' };
    }

    const log = await ActivityLog.findById(logId).lean();
    if (!log) throw { status: 404, message: 'Log not found' };

    return log;
};
