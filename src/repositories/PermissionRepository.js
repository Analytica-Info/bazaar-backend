const Permission = require('../models/Permission');
const BaseRepository = require('./BaseRepository');

class PermissionRepository extends BaseRepository {
    constructor() { super(Permission); }
}

module.exports = PermissionRepository;
