const BankPromoCodeUsage = require('../models/BankPromoCodeUsage');
const BaseRepository = require('./BaseRepository');

class BankPromoCodeUsageRepository extends BaseRepository {
    constructor() { super(BankPromoCodeUsage); }
}

module.exports = BankPromoCodeUsageRepository;
