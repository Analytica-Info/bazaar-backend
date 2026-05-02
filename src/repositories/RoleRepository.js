const Role = require('../models/Role');
const BaseRepository = require('./BaseRepository');

class RoleRepository extends BaseRepository {
    constructor() { super(Role); }
}

module.exports = RoleRepository;
