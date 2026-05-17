'use strict';

/**
 * Regression test for the hot-offers rail shape.
 *
 * Bug: the shared v1 getHotOffers use-case returns a raw ARRAY of
 * price-range buckets. The v2 rail controller spreads the rail's
 * return value into the envelope via { ...data, railName, page, limit }.
 * Spreading an array into an object produces numeric-string keys
 * ({"0":…, "1":…, railName, page, limit}) — a Map-shaped envelope
 * that mobile clients couldn't iterate.
 *
 * Fix: src/services/home/rails/hotOffers.js wraps the use-case result
 * in { status, count, priceRanges } before returning to the registry.
 *
 * This test ensures the wrapper never regresses — the registered
 * fetch() must return an object whose `priceRanges` is an array.
 */

jest.mock('../../../src/services/smartCategories/use-cases/getHotOffers', () => ({
    getHotOffers: jest.fn(),
}));

const { getHotOffers } = require('../../../src/services/smartCategories/use-cases/getHotOffers');

// Force rails to self-register against the registry singleton
require('../../../src/services/home');
const registry = require('../../../src/services/home/registry');

describe('home/rails/hotOffers wrapper', () => {
    it('wraps the use-case array result in { status, count, priceRanges } — never numeric-keyed', async () => {
        const useCaseResult = [
            { priceRange: 'AED 1 - 49', label: 'Budget Finds', images: ['a.jpg'] },
            { priceRange: 'AED 50 - 99', label: 'Hot Mid-Range Deals', images: ['b.jpg'] },
        ];
        getHotOffers.mockResolvedValue(useCaseResult);

        const reg = registry.resolve('hot-offers');
        expect(reg).toBeTruthy();

        const data = await reg.fetch({ params: { priceField: 'tax_inclusive' } });

        // Critical: data is an object with named keys, not a numeric-keyed array.
        expect(data).toEqual({
            status: true,
            count: 2,
            priceRanges: useCaseResult,
        });
        expect(Array.isArray(data.priceRanges)).toBe(true);
        expect(data).not.toHaveProperty('0');
        expect(data).not.toHaveProperty('1');
    });

    it('handles a non-array return defensively (count:0, priceRanges:[])', async () => {
        getHotOffers.mockResolvedValue(undefined);
        const data = await registry.resolve('hot-offers').fetch({ params: {} });
        expect(data).toEqual({ status: true, count: 0, priceRanges: [] });
    });

    it('handles empty array (count:0)', async () => {
        getHotOffers.mockResolvedValue([]);
        const data = await registry.resolve('hot-offers').fetch({ params: {} });
        expect(data).toEqual({ status: true, count: 0, priceRanges: [] });
    });
});
