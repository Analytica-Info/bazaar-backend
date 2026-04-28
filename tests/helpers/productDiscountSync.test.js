'use strict';

jest.mock('../../src/models/Product');
jest.mock('../../src/services/metricsService', () => ({
    recordDiscountSync: jest.fn().mockResolvedValue(undefined),
}));

// Cache mock — controls what cachedMax is returned
// Variable must be prefixed with "mock" for jest.mock factory hoisting rules.
const mockCache = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    key: (...parts) => parts.join(':'),
};
jest.mock('../../src/utilities/cache', () => mockCache);
jest.mock('../../src/utilities/logger', () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const Product = require('../../src/models/Product');
const { syncDiscountFieldsForParentIds } = require('../../src/helpers/productDiscountSync');

// A minimal product document shape that passes computeProductDiscountFields
function makeProduct(id, taxInclusive, variantPrice, isHighest = false) {
    return {
        _id: `oid_${id}`,
        product: { id, price_standard: { tax_inclusive: taxInclusive } },
        variantsData: [{ id: `v_${id}`, price: variantPrice, qty: 10 }],
        isHighest,
        status: true,
        totalQty: 10,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockCache.set.mockResolvedValue(undefined);
});

describe('syncDiscountFieldsForParentIds', () => {
    it('returns early when no parent IDs given', async () => {
        const result = await syncDiscountFieldsForParentIds([], 'test', 'now');
        expect(result.bulkWriteCount).toBe(0);
        expect(Product.find).not.toHaveBeenCalled();
    });

    describe('cache miss — full scan path', () => {
        it('does a full scan and writes to all products when cache is empty', async () => {
            mockCache.get.mockResolvedValue(null); // cache miss

            // originalPrice = tax_inclusive / 0.65 = 100/0.65 ≈ 153.85
            // discount for p1 = round((153.85 - 50) / 153.85 * 100) = 68
            // discount for p2 = round((153.85 - 80) / 153.85 * 100) = 48
            const target = makeProduct('p1', 100, 50);
            const other  = makeProduct('p2', 100, 80);

            Product.find
                .mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve([target]) }) })
                .mockReturnValueOnce({ lean: () => Promise.resolve([target, other]) });

            Product.bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 2 });

            const result = await syncDiscountFieldsForParentIds(['p1'], 'webhook', 'now');

            expect(result.path).toBe('full-scan');
            expect(result.bulkWriteCount).toBe(2);
            // maxDiscount = 68 (p1's discount)
            expect(mockCache.set).toHaveBeenCalledWith(
                expect.stringContaining('max-discount'),
                '68',
                expect.any(Number)
            );
        });
    });

    describe('fast path — cache hit, leaderboard unchanged', () => {
        it('only updates target product when its discount is below cached max', async () => {
            mockCache.get.mockResolvedValue('70'); // cached global max = 70

            const target = makeProduct('p1', 100, 65, false); // ~35% discount — below max

            Product.find
                .mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve([target]) }) });

            Product.bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 1 });

            const result = await syncDiscountFieldsForParentIds(['p1'], 'webhook', 'now');

            expect(result.path).toBe('fast');
            // Only 1 op: the target product update (no full-table scan)
            expect(result.bulkWriteCount).toBe(1);
            // Cache max should NOT be updated (discount unchanged at top)
            expect(mockCache.set).not.toHaveBeenCalled();
        });

        it('marks target as isHighest on tie but does NOT demote co-leaders', async () => {
            // taxInclusive=100, variantPrice=50 → originalPrice=100/0.65≈153.85
            // discount = round((153.85-50)/153.85*100) = 68
            // Set cached max = 68 so this is a genuine tie
            mockCache.get.mockResolvedValue('68');

            const target = makeProduct('p1', 100, 50, false);

            Product.find
                .mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve([target]) }) });

            Product.bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 1 });

            const result = await syncDiscountFieldsForParentIds(['p1'], 'webhook', 'now');

            expect(result.path).toBe('fast');
            const ops = Product.bulkWrite.mock.calls[0][0];
            // Only one op: set isHighest: true on the target — no demote on a tie
            expect(ops).toHaveLength(1);
            expect(ops[0].updateOne.update.$set.isHighest).toBe(true);
            expect(ops.find(op => op.updateMany)).toBeUndefined();
        });

        it('demotes old leader when target is a strictly new leader (> cached max)', async () => {
            mockCache.get.mockResolvedValue('40');

            // taxInclusive=100, variantPrice=40 → ~74% discount > 40
            const target = makeProduct('p1', 100, 40, false);

            Product.find
                .mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve([target]) }) });

            Product.bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 2 });

            const result = await syncDiscountFieldsForParentIds(['p1'], 'webhook', 'now');

            expect(result.path).toBe('fast');
            const ops = Product.bulkWrite.mock.calls[0][0];
            expect(ops[0].updateOne.update.$set.isHighest).toBe(true);
            // Demote op IS present for a strictly new leader
            expect(ops[1].updateMany).toBeDefined();
        });

        it('updates cached max when target surpasses it', async () => {
            mockCache.get.mockResolvedValue('40');

            // taxInclusive=100, variantPrice=45 → ~55% discount > 40
            const target = makeProduct('p1', 100, 45, false);

            Product.find
                .mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve([target]) }) });

            Product.bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 2 });

            const result = await syncDiscountFieldsForParentIds(['p1'], 'webhook', 'now');

            expect(result.path).toBe('fast');
            expect(mockCache.set).toHaveBeenCalledWith(
                expect.stringContaining('max-discount'),
                expect.any(String),
                expect.any(Number)
            );
        });
    });

    describe('full scan — leader dropped', () => {
        it('does full scan when previously-isHighest product discount decreases', async () => {
            mockCache.get.mockResolvedValue('70');

            // This product WAS the leader (isHighest=true) but now has lower discount
            const target = makeProduct('p1', 100, 80, true); // now ~23% — dropped from 70%
            const other  = makeProduct('p2', 100, 25, false); // 75%

            Product.find
                .mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve([target]) }) })
                .mockReturnValueOnce({ lean: () => Promise.resolve([target, other]) });

            Product.bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 2 });

            const result = await syncDiscountFieldsForParentIds(['p1'], 'webhook', 'now');

            expect(result.path).toBe('full-scan');
            // Full scan wrote to all products
            expect(result.bulkWriteCount).toBe(2);
        });
    });

    describe('target not found in DB', () => {
        it('falls back to full scan when target product does not exist', async () => {
            mockCache.get.mockResolvedValue('50');

            // Target lookup returns empty
            Product.find
                .mockReturnValueOnce({ select: () => ({ lean: () => Promise.resolve([]) }) })
                .mockReturnValueOnce({ lean: () => Promise.resolve([makeProduct('p2', 100, 60)]) });

            Product.bulkWrite = jest.fn().mockResolvedValue({ modifiedCount: 1 });

            const result = await syncDiscountFieldsForParentIds(['p_unknown'], 'webhook', 'now');

            expect(result.path).toBe('full-scan');
        });
    });
});
