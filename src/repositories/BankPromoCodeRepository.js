const BankPromoCode = require('../models/BankPromoCode');
const BaseRepository = require('./BaseRepository');

class BankPromoCodeRepository extends BaseRepository {
    constructor() { super(BankPromoCode); }
}

module.exports = BankPromoCodeRepository;
