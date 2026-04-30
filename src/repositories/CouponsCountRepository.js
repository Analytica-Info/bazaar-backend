const CouponsCount = require('../models/CouponsCount');
const BaseRepository = require('./BaseRepository');

class CouponsCountRepository extends BaseRepository {
    constructor() { super(CouponsCount); }
}

module.exports = CouponsCountRepository;
