'use strict';

/**
 * Tests for getCategoriesProduct cache layer.
 *
 * Strategy:
 *  - Mock cache so we can spy on getOrSet calls and control hit/miss.
 *  - Mock Product repository to count Mongo hits.
 *  - Mock fetchAndCacheCategories / fetchCategoriesType adapters.
 */

// ── cache mock ────────────────────────────────────────────────────────────────
// Prefixed with `mock` so jest allows the reference inside jest.mock factory.
const mockCacheStore = {};

jest.mock('../../../src/utilities/cache', () => ({
  getOrSet: jest.fn((key, _ttl, fetcher) => {
    if (key in mockCacheStore) return Promise.resolve(mockCacheStore[key]);
    return fetcher().then((value) => {
      mockCacheStore[key] = value;
      return value;
    });
  }),
  key: (...parts) => parts.join(':'),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delPattern: jest.fn(),
}));

// ── runtime config mock ───────────────────────────────────────────────────────
jest.mock('../../../src/config/runtime', () => ({
  cache: { smartCategoryTtl: 300 },
}));

// ── logger mock ───────────────────────────────────────────────────────────────
jest.mock('../../../src/utilities/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

// ── product repository mock ───────────────────────────────────────────────────
const mockFind = jest.fn();
const mockCountDocuments = jest.fn();

jest.mock('../../../src/repositories', () => ({
  products: {
    rawModel: () => ({
      find: mockFind,
      countDocuments: mockCountDocuments,
    }),
  },
}));

// ── adapter mocks ──────────────────────────────────────────────────────────────
const mockFetchAndCacheCategories = jest.fn();
const mockFetchCategoriesType = jest.fn();

jest.mock('../../../src/services/product/adapters/cache', () => ({
  fetchAndCacheCategories: mockFetchAndCacheCategories,
  fetchCategoriesType: mockFetchCategoriesType,
}));

// ── domain mocks ───────────────────────────────────────────────────────────────
jest.mock('../../../src/services/product/domain/projections', () => ({
  LIST_EXCLUDE_SELECT: '-largeField',
}));

jest.mock('../../../src/services/product/domain/statusLogger', () => ({
  logStatusFalseItems: jest.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCategories(categoryId) {
  return [
    {
      category_path: [
        { id: categoryId, name: 'Electronics' },
        { id: `${categoryId}-sub`, name: 'Phones' },
      ],
    },
  ];
}

function makeCategoriesType(categoryId) {
  return {
    data: {
      category_path: [
        { id: categoryId, name: 'Electronics' },
        { id: `${categoryId}-sub`, name: 'Phones' },
      ],
    },
  };
}

function mockProductQuery(products = [], count = 0) {
  mockFind.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(products),
  });
  mockCountDocuments.mockResolvedValue(count);
}

// ── subject (loaded after all mocks are registered) ───────────────────────────
const cache = require('../../../src/utilities/cache');
const { getCategoriesProduct } = require('../../../src/services/product/use-cases/getCategoriesProduct');

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Clear the in-scope store object between tests
  Object.keys(mockCacheStore).forEach((k) => delete mockCacheStore[k]);

  // Restore default getOrSet behaviour (store-backed, simulates Redis)
  cache.getOrSet.mockImplementation((key, _ttl, fetcher) => {
    if (key in mockCacheStore) return Promise.resolve(mockCacheStore[key]);
    return fetcher().then((value) => {
      mockCacheStore[key] = value;
      return value;
    });
  });
});

describe('getCategoriesProduct — cache layer', () => {
  describe('cache population and hit', () => {
    it('first call populates cache; second identical call returns cached value without hitting Mongo', async () => {
      const categoryId = 'cat-123';
      mockFetchAndCacheCategories.mockResolvedValue(makeCategories(categoryId));
      mockFetchCategoriesType.mockResolvedValue(makeCategoriesType(categoryId));
      mockProductQuery([{ _id: 'prod-1' }], 1);

      // First call — cache miss, fetcher runs
      const first = await getCategoriesProduct(categoryId, { page: '1', limit: '10' });
      expect(mockFind).toHaveBeenCalledTimes(1);
      expect(mockCountDocuments).toHaveBeenCalledTimes(1);
      expect(first.success).toBe(true);
      expect(first.filteredProducts).toHaveLength(1);

      // Reset Mongo + adapter mocks so a second DB call would be detectable
      mockFind.mockClear();
      mockCountDocuments.mockClear();
      mockFetchAndCacheCategories.mockClear();
      mockFetchCategoriesType.mockClear();

      // Second identical call — cache hit, fetcher must NOT run
      const second = await getCategoriesProduct(categoryId, { page: '1', limit: '10' });
      expect(mockFind).not.toHaveBeenCalled();
      expect(mockCountDocuments).not.toHaveBeenCalled();
      expect(second).toEqual(first);
    });
  });

  describe('cache key discrimination — categoryId', () => {
    it('different categoryId values produce different cache keys and independent fetcher calls', async () => {
      const catA = 'cat-AAA';
      const catB = 'cat-BBB';

      mockFetchAndCacheCategories
        .mockResolvedValueOnce(makeCategories(catA))
        .mockResolvedValueOnce(makeCategories(catB));
      mockFetchCategoriesType
        .mockResolvedValueOnce(makeCategoriesType(catA))
        .mockResolvedValueOnce(makeCategoriesType(catB));
      mockProductQuery([{ _id: 'prod-A' }], 1);

      await getCategoriesProduct(catA, { page: '1', limit: '10' });

      mockProductQuery([{ _id: 'prod-B' }], 2);
      await getCategoriesProduct(catB, { page: '1', limit: '10' });

      // Two separate getOrSet calls with distinct keys
      expect(cache.getOrSet).toHaveBeenCalledTimes(2);
      const keys = cache.getOrSet.mock.calls.map((c) => c[0]);
      expect(keys[0]).toContain(catA);
      expect(keys[1]).toContain(catB);
      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  describe('cache key discrimination — page and limit', () => {
    it('different page values produce different cache keys', async () => {
      const categoryId = 'cat-pg';

      mockFetchAndCacheCategories.mockResolvedValue(makeCategories(categoryId));
      mockFetchCategoriesType.mockResolvedValue(makeCategoriesType(categoryId));
      mockProductQuery([], 0);

      await getCategoriesProduct(categoryId, { page: '1', limit: '10' });
      await getCategoriesProduct(categoryId, { page: '2', limit: '10' });

      const keys = cache.getOrSet.mock.calls.map((c) => c[0]);
      expect(keys[0]).toContain('p1');
      expect(keys[1]).toContain('p2');
      expect(keys[0]).not.toBe(keys[1]);
    });

    it('different limit values produce different cache keys', async () => {
      const categoryId = 'cat-lim';

      mockFetchAndCacheCategories.mockResolvedValue(makeCategories(categoryId));
      mockFetchCategoriesType.mockResolvedValue(makeCategoriesType(categoryId));
      mockProductQuery([], 0);

      await getCategoriesProduct(categoryId, { page: '1', limit: '10' });
      await getCategoriesProduct(categoryId, { page: '1', limit: '20' });

      const keys = cache.getOrSet.mock.calls.map((c) => c[0]);
      expect(keys[0]).toContain('l10');
      expect(keys[1]).toContain('l20');
      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  describe('cache-disabled degradation', () => {
    it('returns correct data when cache.getOrSet falls back to fetcher (Redis unavailable)', async () => {
      // Simulate Redis unavailable: getOrSet always calls fetcher directly
      cache.getOrSet.mockImplementation((_key, _ttl, fetcher) => fetcher());

      const categoryId = 'cat-degraded';
      mockFetchAndCacheCategories.mockResolvedValue(makeCategories(categoryId));
      mockFetchCategoriesType.mockResolvedValue(makeCategoriesType(categoryId));
      mockProductQuery([{ _id: 'prod-deg' }], 1);

      const result = await getCategoriesProduct(categoryId, { page: '1', limit: '10' });

      expect(result.success).toBe(true);
      expect(result.filteredProducts).toHaveLength(1);
      expect(result.categoryId).toBe(categoryId);
    });
  });

  describe('missing categoryId — no cache', () => {
    it('skips cache.getOrSet when categoryId is falsy', async () => {
      mockFetchAndCacheCategories.mockResolvedValue([]);
      mockFetchCategoriesType.mockResolvedValue(null);
      mockProductQuery([], 0);

      await getCategoriesProduct(undefined, { page: '1', limit: '10' });

      // getOrSet must NOT be called when categoryId is absent
      expect(cache.getOrSet).not.toHaveBeenCalled();
    });
  });

  describe('cache key format', () => {
    it('uses the expected namespace segments', async () => {
      const categoryId = 'cat-format';
      mockFetchAndCacheCategories.mockResolvedValue(makeCategories(categoryId));
      mockFetchCategoriesType.mockResolvedValue(makeCategoriesType(categoryId));
      mockProductQuery([], 0);

      await getCategoriesProduct(categoryId, { page: '3', limit: '15' });

      const key = cache.getOrSet.mock.calls[0][0];
      expect(key).toBe(`catalog:categories-product:${categoryId}:p3:l15:v1`);
    });
  });
});
