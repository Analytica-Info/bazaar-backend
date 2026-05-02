'use strict';

const axios = require('axios');

module.exports = async function verifyTabbyPayment(paymentId, requestingUserId = null) {
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

    const paymentResp = await axios.get(`https://api.tabby.ai/api/v2/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}` }
    });
    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();

    if (status === 'AUTHORIZED') {
        const captureResp = await axios.post(
            `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
            { amount: payment.amount },
            { headers: { 'Authorization': `Bearer ${process.env.TABBY_SECRET_KEY}` } }
        );
        if (captureResp.data.status?.toUpperCase() !== 'CLOSED') {
            throw { status: 500, message: 'Capture failed' };
        }
    }

    const finalStatus = status === 'AUTHORIZED' ? 'CLOSED' : status;
    if (finalStatus === 'CLOSED') {
        return { message: `Payment status is ${status}` };
    }

    return { message: `Payment status is ${status}`, finalStatus };
};
