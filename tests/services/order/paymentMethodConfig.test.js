'use strict';

/**
 * Tests for PaymentMethodConfigRepository
 *
 * Covers:
 *  - Lazy init: first read with no DB doc creates the default doc
 *  - Subsequent reads return the existing doc
 */

// We will stub the model directly
const SINGLETON_DOC = {
    _id: 'singleton',
    stripeEnabled: true,
    tabbyEnabled: true,
    nomodEnabled: false,
    updatedBy: 'system',
    updatedAt: null,
};

// Fake model factory
function makeFakeModel(existingDoc = null) {
    const findOneAndUpdateResult = existingDoc || SINGLETON_DOC;

    const fakeQuery = {
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(findOneAndUpdateResult),
    };

    return {
        findById: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue(existingDoc),
        }),
        findOneAndUpdate: jest.fn().mockReturnValue(fakeQuery),
    };
}

// Bypass BaseRepository model requirement by requiring the class and instantiating directly
const BaseRepository = require('../../../src/repositories/BaseRepository');
const PaymentMethodConfigRepository = require('../../../src/repositories/PaymentMethodConfigRepository');

describe('PaymentMethodConfigRepository.getSingleton', () => {
    test('returns existing doc when it is already present', async () => {
        const fakeModel = makeFakeModel(SINGLETON_DOC);
        const repo = new PaymentMethodConfigRepository();
        repo.model = fakeModel;

        const doc = await repo.getSingleton();

        expect(fakeModel.findById.mock.calls[0][0]).toBe('singleton');
        expect(fakeModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(doc).toEqual(SINGLETON_DOC);
    });

    test('lazy init: creates default doc when none exists', async () => {
        const fakeModel = makeFakeModel(null); // no existing doc
        const repo = new PaymentMethodConfigRepository();
        repo.model = fakeModel;

        const doc = await repo.getSingleton();

        expect(fakeModel.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'singleton' },
            expect.objectContaining({ $setOnInsert: expect.objectContaining({ _id: 'singleton' }) }),
            expect.objectContaining({ upsert: true, new: true })
        );
        expect(doc).toBeDefined();
        expect(doc._id).toBe('singleton');
    });
});

describe('PaymentMethodConfigRepository.updateSingleton', () => {
    test('patches only the supplied fields and sets updatedAt / updatedBy', async () => {
        const updatedDoc = { ...SINGLETON_DOC, stripeEnabled: false, updatedBy: 'admin1', updatedAt: new Date('2026-05-01') };
        const fakeModel = makeFakeModel(SINGLETON_DOC);
        fakeModel.findOneAndUpdate = jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnThis(),
            exec: jest.fn().mockResolvedValue(updatedDoc),
        });
        const repo = new PaymentMethodConfigRepository();
        repo.model = fakeModel;

        const now = new Date('2026-05-01');
        const result = await repo.updateSingleton({ stripeEnabled: false }, { updatedAt: now, updatedBy: 'admin1' });

        expect(fakeModel.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: 'singleton' },
            { $set: { stripeEnabled: false, updatedAt: now, updatedBy: 'admin1' } },
            expect.objectContaining({ upsert: true, new: true })
        );
        expect(result.stripeEnabled).toBe(false);
    });
});
