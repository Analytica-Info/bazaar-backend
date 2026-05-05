const Contact = require('../models/Contact');
const BaseRepository = require('./BaseRepository');

class ContactRepository extends BaseRepository {
    constructor() { super(Contact); }
}

module.exports = ContactRepository;
