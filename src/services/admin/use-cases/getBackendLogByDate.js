'use strict';

const BackendLog = require('../../../repositories').backendLogs.rawModel();

const DATE_REGEX       = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PLATFORMS  = ['Mobile App Backend', 'Website Backend'];

module.exports = async function getBackendLogByDate(date, platform) {
    if (!date || !platform) {
        throw { status: 400, message: 'Date and platform are required' };
    }

    if (!DATE_REGEX.test(date)) {
        throw { status: 400, message: 'Invalid date format. Expected YYYY-MM-DD' };
    }

    if (!VALID_PLATFORMS.includes(platform)) {
        throw { status: 400, message: 'Invalid platform. Expected "Mobile App Backend" or "Website Backend"' };
    }

    const log = await BackendLog.findOne({ date, platform }).lean();
    if (!log) throw { status: 404, message: 'Log not found for the specified date and platform' };

    log.activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return log;
};
