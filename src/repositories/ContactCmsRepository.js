const ContactCms = require('../models/ContactCms');
const BaseRepository = require('./BaseRepository');

class ContactCmsRepository extends BaseRepository {
    constructor() { super(ContactCms); }
}

module.exports = ContactCmsRepository;
