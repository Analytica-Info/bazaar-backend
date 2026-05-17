'use strict';

/**
 * Unit tests for buildHomeManifest use-case.
 *
 * All external dependencies are mocked:
 *  - cache   → in-memory Map-backed fake
 *  - clock   → fixed Date (2026-05-16T12:00:00.000Z)
 *  - logger  → jest.fn stubs
 *  - runtime → minimal stub
 *  - home/index (registry) → per-test fake registry
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// --- cache -------------------------------------------------------------------
// The factory is hoisted by jest, so it must be self-contained.
// We hang _store/_sets on the module object so tests can inspect them.
jest.mock('../../../../src/utilities/cache', () => {
  const store = new Map();
  const sets  = [];
  return {
    _store: store,
    _sets:  sets,
    key(...parts) { return parts.join(':'); },
    async get(k) { return store.has(k) ? store.get(k) : undefined; },
    async set(k, value, ttl) {
      store.set(k, value);
      sets.push({ key: k, value, ttl });
      return true;
    },
    async getOrSet(k, ttl, fetcher) {
      if (store.has(k)) return store.get(k);
      const value = await fetcher();
      store.set(k, value);
      sets.push({ key: k, value, ttl });
      return value;
    },
  };
});

// --- clock -------------------------------------------------------------------
// Note: jest.mock factories cannot reference out-of-scope variables, so the
// date string is inlined here. FIXED_DATE is defined below for use in tests.
jest.mock('../../../../src/utilities/clock', () => ({
  now:        () => new Date('2026-05-16T12:00:00.000Z'),
  nowMs:      () => new Date('2026-05-16T12:00:00.000Z').getTime(),
  today:      () => new Date('2026-05-16T00:00:00.000Z'),
  setClock:   jest.fn(),
  resetClock: jest.fn(),
}));

const FIXED_DATE = new Date('2026-05-16T12:00:00.000Z');

// --- logger ------------------------------------------------------------------
jest.mock('../../../../src/utilities/logger', () => ({
  warn:  jest.fn(),
  error: jest.fn(),
  info:  jest.fn(),
}));

// --- runtime -----------------------------------------------------------------
jest.mock('../../../../src/config/runtime', () => ({
  cache: { homeManifestTtl: 60 },
  timeouts: { homeRail: 1500 },
}));

// --- home/index (registry) ---------------------------------------------------
// We replace the registry entirely so no real rails are loaded.
// Factory must be self-contained (hoisted by jest), so the registry object is
// hung on the module export and retrieved via require() after mocking.
jest.mock('../../../../src/services/home/index', () => {
  const reg = {
    _rails: [],
    list({ platform }) {
      return reg._rails.filter(
        (r) => r.platforms.includes(platform) && (r.enabled ? r.enabled() : true)
      );
    },
    resolve(name) {
      return reg._rails.find((r) => r.name === name) || null;
    },
  };
  return { registry: reg };
});

// ── Subject under test ────────────────────────────────────────────────────────
const buildHomeManifest = require('../../../../src/services/home/use-cases/buildHomeManifest');
const fakeLogger = require('../../../../src/utilities/logger');

// Grab the fake cache module so tests can inspect _store and _sets
const fakeCache = require('../../../../src/utilities/cache');

// Grab the fake registry so tests can configure rails per-test
const { registry: fakeRegistry } = require('../../../../src/services/home/index');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRail(name, fetchImpl, { platforms = ['mobile'], defaultParams = {} } = {}) {
  // fetch MUST return a Promise because withRailTimeout calls fetchFn().then(...)
  const defaultFetch = async () => ({ products: [{ id: 1 }] });
  const wrappedImpl = fetchImpl
    ? async (ctx) => fetchImpl(ctx)
    : defaultFetch;
  return { name, platforms, fetch: jest.fn(wrappedImpl), defaultParams, enabled: () => true };
}

function resetCache() {
  fakeCache._store.clear();
  fakeCache._sets.length = 0;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildHomeManifest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCache();
    fakeRegistry._rails = [];
  });

  // 1. Happy path ─────────────────────────────────────────────────────────────
  describe('happy path — 3 rails all succeed', () => {
    it('returns manifest with 3 ok entries, hex version, correct meta', async () => {
      // Arrange
      fakeRegistry._rails = [
        makeRail('rail-a', () => ({ products: [{ id: 1 }] })),
        makeRail('rail-b', () => [1, 2, 3]),
        makeRail('rail-c', () => ({ title: 'Hot' })),
      ];

      // Act
      const manifest = await buildHomeManifest({ platform: 'mobile' });

      // Assert
      expect(manifest.version).toBe(1);
      expect(manifest.platform).toBe('mobile');
      expect(manifest.generatedAt).toBe(FIXED_DATE.toISOString());
      expect(manifest.rails).toHaveLength(3);

      manifest.rails.forEach((entry) => {
        expect(entry.status).toBe('ok');
        expect(entry.version).toMatch(/^[0-9a-f]{12}$/);
        expect(entry.ttl).toBe(60);
      });
    });
  });

  // 2. Empty classification ───────────────────────────────────────────────────
  describe('empty classification', () => {
    it('marks [] as empty, {products:[]} as empty, null as empty, and non-empty as ok', async () => {
      // Arrange
      fakeRegistry._rails = [
        makeRail('empty-array',    () => []),
        makeRail('empty-products', () => ({ products: [] })),
        makeRail('null-data',      () => null),
        makeRail('has-products',   () => ({ products: [{ id: 1 }] })),
      ];

      // Act
      const manifest = await buildHomeManifest({ platform: 'mobile' });

      // Assert
      const byName = Object.fromEntries(manifest.rails.map((r) => [r.name, r]));
      expect(byName['empty-array'].status).toBe('empty');
      expect(byName['empty-products'].status).toBe('empty');
      expect(byName['null-data'].status).toBe('empty');
      expect(byName['has-products'].status).toBe('ok');
    });
  });

  // 3. Failure isolation ──────────────────────────────────────────────────────
  describe('failure isolation', () => {
    it('failed rail has error status while sibling rails succeed independently', async () => {
      // Arrange
      fakeRegistry._rails = [
        makeRail('ok-a',  () => ({ products: [{ id: 1 }] })),
        makeRail('bad',   () => { throw new Error('timeout'); }),
        makeRail('ok-b',  () => ({ products: [{ id: 2 }] })),
      ];

      // Act
      const manifest = await buildHomeManifest({ platform: 'mobile' });

      // Assert
      expect(manifest.rails).toHaveLength(3);

      const byName = Object.fromEntries(manifest.rails.map((r) => [r.name, r]));
      expect(byName['bad'].status).toBe('error');
      expect(byName['bad'].data).toBeNull();
      expect(byName['bad'].version).toBeNull();

      expect(byName['ok-a'].status).toBe('ok');
      expect(byName['ok-b'].status).toBe('ok');
    });
  });

  // 4. railFilter narrowing ───────────────────────────────────────────────────
  describe('railFilter', () => {
    it('returns only requested rails in order; unknown names are dropped and logger.warn fired', async () => {
      // Arrange
      fakeRegistry._rails = [
        makeRail('a'),
        makeRail('b'),
        makeRail('c'),
      ];

      // Act
      const manifest = await buildHomeManifest({ platform: 'mobile', rails: ['a', 'zzz', 'c'] });

      // Assert — 'zzz' dropped, 'b' excluded, order preserved
      expect(manifest.rails).toHaveLength(2);
      expect(manifest.rails[0].name).toBe('a');
      expect(manifest.rails[1].name).toBe('c');

      // Assert logger.warn was called about the unknown rail
      expect(fakeLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ unknown: expect.arrayContaining(['zzz']) }),
        expect.any(String),
      );
    });
  });

  // 5. params override per-rail ───────────────────────────────────────────────
  describe('params override', () => {
    it('merges per-rail params over defaultParams without bleeding into other rails', async () => {
      // Arrange
      const railX = makeRail('rail-x', undefined, { defaultParams: { limit: 10, page: 1 } });
      const railY = makeRail('rail-y', undefined, { defaultParams: { limit: 5 } });
      fakeRegistry._rails = [railX, railY];

      // Act
      await buildHomeManifest({
        platform: 'mobile',
        params: { 'rail-x': { limit: 20 } },
      });

      // Assert rail-x got merged params
      const ctxX = railX.fetch.mock.calls[0][0];
      expect(ctxX.params).toEqual({ limit: 20, page: 1 });

      // Assert rail-y was NOT affected by rail-x's override
      const ctxY = railY.fetch.mock.calls[0][0];
      expect(ctxY.params).toEqual({ limit: 5 });
    });
  });

  // 6. Cache HIT ──────────────────────────────────────────────────────────────
  describe('cache hit', () => {
    it('returns cached manifest without invoking any rail fetcher', async () => {
      // Arrange
      const cachedManifest = { version: 1, platform: 'mobile', generatedAt: 'cached', rails: [] };
      const cacheKey = fakeCache.key('home', 'manifest:mobile:v1');
      fakeCache._store.set(cacheKey, cachedManifest);

      const rail = makeRail('should-not-run');
      fakeRegistry._rails = [rail];

      // Act
      const result = await buildHomeManifest({ platform: 'mobile' });

      // Assert
      expect(result).toEqual(cachedManifest);
      expect(rail.fetch).not.toHaveBeenCalled();
    });
  });

  // 7. Cache key varies by platform ───────────────────────────────────────────
  describe('cache key platform variation', () => {
    it('uses different cache keys for web vs mobile (platform appears in key)', async () => {
      // Arrange — register rails for both platforms
      fakeRegistry._rails = [
        makeRail('rail-m', () => ({ products: [{ id: 1 }] }), { platforms: ['mobile'] }),
      ];

      // Act: mobile build
      await buildHomeManifest({ platform: 'mobile' });
      const mobileKey = fakeCache._sets[fakeCache._sets.length - 1]?.key;

      // Clear store so web call is also a cache miss; keep _sets for later
      fakeCache._store.clear();
      fakeRegistry._rails = [
        makeRail('rail-w', () => ({ products: [{ id: 2 }] }), { platforms: ['web'] }),
      ];
      await buildHomeManifest({ platform: 'web' });
      const webKey = fakeCache._sets[fakeCache._sets.length - 1]?.key;

      // Assert platform appears in respective keys and they differ
      expect(mobileKey).toBeDefined();
      expect(webKey).toBeDefined();
      expect(mobileKey).toContain('mobile');
      expect(webKey).toContain('web');
      expect(mobileKey).not.toBe(webKey);
    });
  });

  // 8a. All rails fail ────────────────────────────────────────────────────────
  describe('all rails fail', () => {
    it('returns manifest with all error entries, does not throw, and skips cache.set', async () => {
      // Arrange
      fakeRegistry._rails = [
        makeRail('r1', () => { throw new Error('boom1'); }),
        makeRail('r2', () => { throw new Error('boom2'); }),
        makeRail('r3', () => { throw new Error('boom3'); }),
      ];

      // Act — must not throw
      const manifest = await buildHomeManifest({ platform: 'mobile' });

      // Assert all entries have error status
      expect(manifest.rails).toHaveLength(3);
      manifest.rails.forEach((r) => {
        expect(r.status).toBe('error');
        expect(r.data).toBeNull();
        expect(r.version).toBeNull();
      });

      // Assert cache.set was NOT called
      expect(fakeCache._sets.length).toBe(0);
    });
  });

  // 8b. Prototype pollution hardening in clampRailParams ─────────────────────
  describe('prototype pollution hardening', () => {
    it('does not pass __proto__ or constructor keys through to rail params', async () => {
      // Arrange
      const rail = makeRail('rail-p', undefined, { defaultParams: {} });
      fakeRegistry._rails = [rail];

      // Act — pass dangerous keys as user params
      await buildHomeManifest({
        platform: 'mobile',
        params: {
          'rail-p': Object.assign(Object.create(null), {
            __proto__: { limit: 999999 },
            constructor: { limit: 999999 },
            limit: 5,
          }),
        },
      });

      // Assert the dangerous keys did not leak; only safe limit passes
      const ctx = rail.fetch.mock.calls[0][0];
      expect(ctx.params.limit).toBe(5);
      // __proto__ and constructor must NOT be own properties of params
      expect(Object.prototype.hasOwnProperty.call(ctx.params, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(ctx.params, 'constructor')).toBe(false);
      expect(Object.getPrototypeOf(ctx.params)).toBe(Object.prototype);
    });
  });

  // 8c. Stable params hash ────────────────────────────────────────────────────
  describe('stable params hash in cache key', () => {
    it('same params in different key order produce the same cache key', async () => {
      // Arrange — two calls with param objects that are logically identical
      fakeRegistry._rails = [
        makeRail('s1', () => ({ products: [{ id: 1 }] })),
      ];

      await buildHomeManifest({
        platform: 'mobile',
        params: { 's1': { limit: 10, page: 2 } },
      });
      const key1 = fakeCache._sets[fakeCache._sets.length - 1]?.key;

      // Second call: same logical params but different insertion order
      fakeCache._store.clear();
      fakeCache._sets.length = 0;

      await buildHomeManifest({
        platform: 'mobile',
        params: { 's1': { page: 2, limit: 10 } },
      });
      const key2 = fakeCache._sets[fakeCache._sets.length - 1]?.key;

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).toBe(key2);
    });
  });

  // 8. Cache MISS then SET ────────────────────────────────────────────────────
  describe('cache miss then set', () => {
    it('on miss builds manifest and writes it to cache with ttl=60', async () => {
      // Arrange — all rails succeed (gate: "don't cache on partial failure" contract)
      fakeRegistry._rails = [
        makeRail('rail-1', () => ({ products: [{ id: 1 }] })),
        makeRail('rail-2', () => ({ products: [{ id: 2 }] })),
      ];

      // Act
      const manifest = await buildHomeManifest({ platform: 'mobile' });

      // Assert at least one set was recorded with ttl=60
      expect(fakeCache._sets.length).toBeGreaterThanOrEqual(1);
      const write = fakeCache._sets.find((s) => s.ttl === 60);
      expect(write).toBeDefined();
      expect(write.value).toMatchObject({ version: 1, platform: 'mobile' });
      // Verify the manifest returned has all rails ok (all rails succeeded)
      manifest.rails.forEach((r) => expect(r.status).toBe('ok'));
    });
  });
});
