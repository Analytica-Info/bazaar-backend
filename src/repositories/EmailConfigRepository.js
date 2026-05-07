const EmailConfig = require('../models/EmailConfig');
const BaseRepository = require('./BaseRepository');

class EmailConfigRepository extends BaseRepository {
    constructor() { super(EmailConfig); }
}

module.exports = EmailConfigRepository;
