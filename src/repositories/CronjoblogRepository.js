const Cronjoblog = require('../models/Cronjoblog');
const BaseRepository = require('./BaseRepository');

class CronjoblogRepository extends BaseRepository {
    constructor() { super(Cronjoblog); }
}

module.exports = CronjoblogRepository;
