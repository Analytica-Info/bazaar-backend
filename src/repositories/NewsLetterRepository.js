const NewsLetter = require('../models/NewsLetter');
const BaseRepository = require('./BaseRepository');

class NewsLetterRepository extends BaseRepository {
    constructor() { super(NewsLetter); }
}

module.exports = NewsLetterRepository;
