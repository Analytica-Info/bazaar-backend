/**
 * Verifies the Order model's pre-save hook mirrors userId <-> user_id so
 * that every write — regardless of which field the caller sets — leaves
 * both fields populated. Closes the long-standing dual-schema duality.
 */
require('../setup');
const mongoose = require('mongoose');
const Order = require('../../src/models/Order');

let counter = 0;
function baseFields() {
    counter += 1;
    return {
        order_id: `T-${Date.now()}-${counter}`,
        order_no: 1000000 + counter,
        name: 'T',
        address: 'a',
        email: 'a@b.c',
        status: 'Confirmed',
        amount_subtotal: '0',
        amount_total: '0',
        discount_amount: '0',
        txn_id: `t-${counter}`,
        payment_method: 'cash',
        payment_status: 'paid',
    };
}

describe('Order ownership field mirroring', () => {
    test('writing only userId mirrors to user_id on save', async () => {
        const id = new mongoose.Types.ObjectId();
        const o = await Order.create({ ...baseFields(), userId: id });
        expect(String(o.userId)).toBe(String(id));
        expect(String(o.get('user_id'))).toBe(String(id));
    });

    test('writing only user_id mirrors to userId on save', async () => {
        const id = new mongoose.Types.ObjectId();
        const o = await Order.create({ ...baseFields(), user_id: id });
        expect(String(o.get('user_id'))).toBe(String(id));
        expect(String(o.userId)).toBe(String(id));
    });

    test('writing both fields with the same value is a no-op', async () => {
        const id = new mongoose.Types.ObjectId();
        const o = await Order.create({ ...baseFields(), userId: id, user_id: id });
        expect(String(o.userId)).toBe(String(id));
        expect(String(o.get('user_id'))).toBe(String(id));
    });

    test('insertMany also mirrors fields', async () => {
        const a = new mongoose.Types.ObjectId();
        const b = new mongoose.Types.ObjectId();
        const docs = await Order.insertMany([
            { ...baseFields(), userId: a },
            { ...baseFields(), user_id: b },
        ]);
        expect(String(docs[0].get('user_id'))).toBe(String(a));
        expect(String(docs[1].userId)).toBe(String(b));
    });
});
