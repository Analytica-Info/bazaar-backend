const ActivityLog = require('../models/ActivityLog');
const BaseRepository = require('./BaseRepository');

class ActivityLogRepository extends BaseRepository {
    constructor() { super(ActivityLog); }
}

module.exports = ActivityLogRepository;
