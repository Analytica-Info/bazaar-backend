const PendingPayment = require('../models/PendingPayment');
const BaseRepository = require('./BaseRepository');

class PendingPaymentRepository extends BaseRepository {
    constructor() { super(PendingPayment); }
}

module.exports = PendingPaymentRepository;
