'use strict';

/**
 * Unit tests for listVerticals use-case.
 */

const mockFindAll = jest.fn();
jest.mock('../../../src/repositories', () => ({
    verticals: { findAll: mockFindAll },
}));

jest.mock('../../../src/utilities/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

// Mock cache to always call fetcher (simulates cache miss) unless overridden.
const mockGetOrSet = jest.fn(async (_key, _ttl, fetcher) => fetcher());
jest.mock('../../../src/utilities/cache', () => ({
    getOrSet: (...args) => mockGetOrSet(...args),
}));

const { listVerticals } = require('../../../src/services/verticals/use-cases/listVerticals');

beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrSet.mockImplementation(async (_key, _ttl, fetcher) => fetcher());
});

describe('listVerticals', () => {
    it('returns UAE entry first followed by db verticals', async () => {
        mockFindAll.mockResolvedValue([
            { id: 'auction', label: 'Auction', tag: 'Live', enabled: false, comingSoon: true, launchDate: null },
        ]);

        const result = await listVerticals();

        expect(result[0]).toMatchObject({ id: 'uae', enabled: true, comingSoon: false });
        expect(result[1]).toMatchObject({ id: 'auction' });
        expect(result).toHaveLength(2);
    });

    it('returns only UAE entry when db is empty', async () => {
        mockFindAll.mockResolvedValue([]);

        const result = await listVerticals();

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('uae');
    });

    it('returns empty list (not an error) when cache returns null', async () => {
        mockGetOrSet.mockResolvedValue(null);

        const result = await listVerticals();

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(0);
    });

    it('returns cached value on second call without hitting the repo', async () => {
        const cached = [{ id: 'uae', label: 'UAE', tag: 'Default', enabled: true, comingSoon: false }];
        mockGetOrSet.mockResolvedValue(cached);

        const result = await listVerticals();

        expect(result).toEqual(cached);
        // Repo should not have been called — cache served it
        expect(mockFindAll).not.toHaveBeenCalled();
    });
});
