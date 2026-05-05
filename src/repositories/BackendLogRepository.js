const BackendLog = require('../models/BackendLog');
const BaseRepository = require('./BaseRepository');

class BackendLogRepository extends BaseRepository {
    constructor() { super(BackendLog); }
}

module.exports = BackendLogRepository;
