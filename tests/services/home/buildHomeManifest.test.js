'use strict';

/**
 * Unit tests for buildHomeManifest orchestrator.
 *
 * We mock the entire home/index module so that requiring buildHomeManifest
 * does not trigger real rail registrations. Then we control the registry
 * directly via a manual mock object.
 */

// Mock cache so getOrSet just calls the fetcher inline (no Redis)
jest.mock('../../../src/utilities/cache', () => ({
  getOrSet: jest.fn((_key, _ttl, fetcher) => fetcher()),
  key: (...parts) => parts.join(':'),
  get: jest.fn(),
  set: jest.fn(),
}));

// Mock clock — stable timestamp (inline values to satisfy jest.mock scope rules)
jest.mock('../../../src/utilities/clock', () => ({
  now: () => new Date('2026-05-11T10:00:00.000Z'),
  nowMs: () => 1747058400000,
  today: () => new Date('2026-05-11T00:00:00.000Z'),
  setClock: jest.fn(),
  resetClock: jest.fn(),
}));

jest.mock('../../../src/utilities/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

// ── registry mock ──────────────────────────────────────────────────────────────
// We mock the home/index module so that buildHomeManifest imports OUR
// controlled registry instead of auto-loading all production rails.

const mockRegistryState = {
  _rails: new Map(),
};

const mockRegistry = {
  register: ({ name, platforms, fetch, defaultParams = {}, enabled = () => true }) => {
    mockRegistryState._rails.set(name, { name, platforms, fetch, defaultParams, enabled });
  },
  resolve: (name) => mockRegistryState._rails.get(name) || null,
  list: ({ platform }) => {
    const result = [];
    for (const reg of mockRegistryState._rails.values()) {
      if (reg.platforms.includes(platform) && reg.enabled()) result.push(reg);
    }
    return result;
  },
  _reset: () => mockRegistryState._rails.clear(),
};

jest.mock('../../../src/services/home/index', () => ({ registry: mockRegistry }));

const buildHomeManifest = require('../../../src/services/home/use-cases/buildHomeManifest');

const FROZEN_ISO = '2026-05-11T10:00:00.000Z';

// ── helpers ───────────────────────────────────────────────────────────────────

function registerMockRail(name, platforms, fetchImpl) {
  mockRegistry.register({
    name,
    platforms,
    defaultParams: {},
    fetch: fetchImpl || (() => Promise.resolve({ products: [{ id: 1 }] })),
  });
}

beforeEach(() => {
  mockRegistry._reset();
  const cache = require('../../../src/utilities/cache');
  cache.getOrSet.mockImplementation((_key, _ttl, fetcher) => fetcher());
});

afterEach(() => {
  mockRegistry._reset();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('buildHomeManifest', () => {
  describe('platform filtering', () => {
    it('returns only rails enabled for the requested platform', async () => {
      registerMockRail('rail-a', ['mobile']);
      registerMockRail('rail-b', ['web']);
      registerMockRail('rail-c', ['mobile', 'web']);

      const manifest = await buildHomeManifest({ platform: 'mobile' });

      const names = manifest.rails.map((r) => r.name);
      expect(names).toContain('rail-a');
      expect(names).toContain('rail-c');
      expect(names).not.toContain('rail-b');
    });

    it('returns the correct manifest shape', async () => {
      registerMockRail('shape-rail', ['mobile']);
      const manifest = await buildHomeManifest({ platform: 'mobile' });

      expect(manifest).toMatchObject({
        version: 1,
        platform: 'mobile',
        generatedAt: FROZEN_ISO,
      });
      expect(Array.isArray(manifest.rails)).toBe(true);
    });
  });

  describe('error isolation', () => {
    it('sets status:error for a failing rail and keeps others ok', async () => {
      registerMockRail('good-rail', ['mobile'], () => Promise.resolve({ products: [{ id: 1 }] }));
      registerMockRail('bad-rail', ['mobile'], () => Promise.reject(new Error('DB down')));

      const manifest = await buildHomeManifest({ platform: 'mobile' });

      const good = manifest.rails.find((r) => r.name === 'good-rail');
      const bad = manifest.rails.find((r) => r.name === 'bad-rail');

      expect(good.status).toBe('ok');
      expect(bad.status).toBe('error');
      expect(bad.data).toBeNull();
    });
  });

  describe('empty detection', () => {
    it('sets status:empty for a rail returning an empty array', async () => {
      registerMockRail('empty-array-rail', ['mobile'], () => Promise.resolve([]));
      const manifest = await buildHomeManifest({ platform: 'mobile' });
      expect(manifest.rails.find((r) => r.name === 'empty-array-rail').status).toBe('empty');
    });

    it('sets status:empty for a rail returning { products: [] }', async () => {
      registerMockRail('empty-products-rail', ['mobile'], () => Promise.resolve({ products: [] }));
      const manifest = await buildHomeManifest({ platform: 'mobile' });
      expect(manifest.rails.find((r) => r.name === 'empty-products-rail').status).toBe('empty');
    });
  });

  describe('deterministic versioning', () => {
    it('produces the same version hash for the same data', async () => {
      const fetchData = { products: [{ id: 42 }] };
      registerMockRail('hash-rail', ['mobile'], () => Promise.resolve(fetchData));

      const m1 = await buildHomeManifest({ platform: 'mobile' });
      const m2 = await buildHomeManifest({ platform: 'mobile' });

      const v1 = m1.rails.find((r) => r.name === 'hash-rail').version;
      const v2 = m2.rails.find((r) => r.name === 'hash-rail').version;
      expect(v1).toBe(v2);
      expect(v1).toHaveLength(12);
    });
  });

  describe('params override', () => {
    it('forwards param overrides to the rail fetcher', async () => {
      const fetchFn = jest.fn(() => Promise.resolve({ products: [{ id: 1 }] }));
      mockRegistry.register({
        name: 'override-rail',
        platforms: ['mobile'],
        defaultParams: { page: 1, limit: 10 },
        fetch: fetchFn,
      });

      await buildHomeManifest({
        platform: 'mobile',
        params: { 'override-rail': { page: 2, limit: 5 } },
      });

      expect(fetchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ page: 2, limit: 5 }),
        })
      );
    });
  });
});
