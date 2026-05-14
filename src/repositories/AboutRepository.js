const About = require('../models/About');
const BaseRepository = require('./BaseRepository');

class AboutRepository extends BaseRepository {
    constructor() { super(About); }
}

module.exports = AboutRepository;
