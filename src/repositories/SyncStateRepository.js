const SyncState = require('../models/SyncState');
const BaseRepository = require('./BaseRepository');

class SyncStateRepository extends BaseRepository {
    constructor() { super(SyncState); }
}

module.exports = SyncStateRepository;
