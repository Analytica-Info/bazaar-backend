'use strict';

/**
 * Unit tests for railController (v2 shared).
 */

jest.mock('../../../../src/utilities/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const { runHandler } = require('../../../_helpers/handlerExec');

// We need the registry to be in a clean state for each test.
const registry = require('../../../../src/services/home/registry');

// Import controller AFTER registry is available (it reads registry at call time, not require time).
const { getRail } = require('../../../../src/controllers/v2/shared/railController');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeReq(params = {}, query = {}) {
  return {
    params,
    query,
    user: null,
  };
}

function makeFetcher(returnValue = { products: [] }) {
  return jest.fn().mockResolvedValue(returnValue);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('railController.getRail', () => {
  beforeEach(() => {
    registry._reset();
    jest.clearAllMocks();
  });

  describe('200 happy path', () => {
    it('returns 200 with wrapped rail data for a known rail', async () => {
      const fetcher = makeFetcher({ products: [{ id: '1' }] });
      registry.register({
        name: 'new-arrivals',
        platforms: ['mobile', 'web'],
        defaultParams: { page: 1, limit: 10 },
        fetch: fetcher,
      });

      const { statusCode, body, headers } = await runHandler(
        getRail,
        makeReq({ railName: 'new-arrivals' }, { page: '2', limit: '20' }),
        { path: '/v2/rails/new-arrivals' }
      );

      expect(statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.railName).toBe('new-arrivals');
      expect(body.data.page).toBe(2);
      expect(body.data.limit).toBe(20);
      expect(body.data.products).toEqual([{ id: '1' }]);
    });

    it('passes page and limit into the rail fetcher ctx.params', async () => {
      const fetcher = makeFetcher({ products: [] });
      registry.register({
        name: 'flash-sales',
        platforms: ['mobile', 'web'],
        defaultParams: { page: 1, limit: 10 },
        fetch: fetcher,
      });

      await runHandler(
        getRail,
        makeReq({ railName: 'flash-sales' }, { page: '2', limit: '20' }),
        { path: '/v2/rails/flash-sales' }
      );

      expect(fetcher).toHaveBeenCalledWith(
        expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 20 }) })
      );
    });

    it('sets Cache-Control: public, max-age=60, stale-while-revalidate=300', async () => {
      registry.register({
        name: 'trending',
        platforms: ['mobile', 'web'],
        defaultParams: { page: 1, limit: 10 },
        fetch: makeFetcher(),
      });

      const { headers } = await runHandler(
        getRail,
        makeReq({ railName: 'trending' }, {}),
        { path: '/v2/rails/trending' }
      );

      expect(headers['Cache-Control']).toBe('public, max-age=60, stale-while-revalidate=300');
    });

    it('forwards categoryId to categories-product rail', async () => {
      const fetcher = makeFetcher({ products: [{ id: 'cat-product' }] });
      registry.register({
        name: 'categories-product',
        platforms: ['mobile', 'web'],
        defaultParams: { categoryId: null, page: 1, limit: 10 },
        fetch: fetcher,
      });

      const { statusCode, body } = await runHandler(
        getRail,
        makeReq({ railName: 'categories-product' }, { page: '1', limit: '10', categoryId: 'abc123' }),
        { path: '/v2/rails/categories-product' }
      );

      expect(statusCode).toBe(200);
      expect(fetcher).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ categoryId: 'abc123' }),
        })
      );
    });

    it('works for anonymous users (no auth required)', async () => {
      registry.register({
        name: 'hot-offers',
        platforms: ['mobile', 'web'],
        defaultParams: { page: 1, limit: 10 },
        fetch: makeFetcher(),
      });

      const { statusCode } = await runHandler(
        getRail,
        makeReq({ railName: 'hot-offers' }, {}),
        { path: '/v2/rails/hot-offers' }
      );

      expect(statusCode).toBe(200);
    });
  });

  describe('404 unknown rail', () => {
    it('returns 404 with UNKNOWN_RAIL for an unregistered rail name', async () => {
      const { statusCode, body } = await runHandler(
        getRail,
        makeReq({ railName: 'does-not-exist' }, {}),
        { path: '/v2/rails/does-not-exist' }
      );

      expect(statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNKNOWN_RAIL');
    });
  });

  describe('error handling', () => {
    it('returns 500 with RAIL_FETCH_FAILED when fetcher throws', async () => {
      registry.register({
        name: 'flash-sales',
        platforms: ['mobile', 'web'],
        defaultParams: { page: 1, limit: 10 },
        fetch: jest.fn().mockRejectedValue(new Error('DB exploded')),
      });

      const { statusCode, body } = await runHandler(
        getRail,
        makeReq({ railName: 'flash-sales' }, {}),
        { path: '/v2/rails/flash-sales' }
      );

      expect(statusCode).toBe(500);
      expect(body.error.code).toBe('RAIL_FETCH_FAILED');
    });
  });
});
