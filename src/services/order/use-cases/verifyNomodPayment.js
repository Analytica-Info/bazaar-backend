'use strict';

const PaymentProviderFactory = require('../../payments/PaymentProviderFactory');

module.exports = async function verifyNomodPayment(paymentId, requestingUserId = null) {
    if (!paymentId) {
        throw { status: 400, message: 'paymentId is required' };
    }

    if (requestingUserId) {
        const PendingPayment = require('../../../repositories').pendingPayments.rawModel();
        const pending = await PendingPayment.findOne({ payment_id: paymentId }).select('user_id').lean();
        if (pending && String(pending.user_id) !== String(requestingUserId)) {
            throw { status: 403, message: 'Not authorized to verify this payment' };
        }
    }

    const provider = PaymentProviderFactory.create('nomod');
    const checkout = await provider.getCheckout(paymentId);
    const status = checkout.status?.toLowerCase();

    if (checkout.paid) {
        return { message: `Payment status is ${status}` };
    }

    return { message: `Payment status is ${status}`, finalStatus: status };
};
