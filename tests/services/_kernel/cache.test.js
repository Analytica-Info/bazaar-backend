'use strict';

const { makeRedisCache, makeNullCache } = require('../../../src/services/_kernel/cache');

// ---------------------------------------------------------------------------
// Helpers — build a fake redis client that simulates an in-memory store
// ---------------------------------------------------------------------------

function makeFakeRedisClient() {
  const store = new Map();

  return {
    _store: store,
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, _ex, ttl) {
      store.set(key, {
        value,
        expiresAt: ttl ? Date.now() + ttl * 1000 : null,
      });
      return 'OK';
    },
    async del(...keys) {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
      }
      return count;
    },
    async scan(_cursor, _match, pattern, _count, _n) {
      const glob = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
      const re = new RegExp('^' + glob + '$');
      const matched = [...store.keys()].filter(k => re.test(k));
      return ['0', matched];
    },
  };
}

// ---------------------------------------------------------------------------
// makeRedisCache — wraps the legacy cache module; tests depend on the port
// contract, not on Redis internals (the legacy module owns its own client).
// We test the adapter's public interface by mocking the legacy module.
// ---------------------------------------------------------------------------

describe('makeRedisCache — port contract', () => {
  it('returns an object with the five required Cache methods', () => {
    const cache = makeRedisCache(null);
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
    expect(typeof cache.del).toBe('function');
    expect(typeof cache.delPattern).toBe('function');
    expect(typeof cache.getOrSet).toBe('function');
  });

  it('returns a frozen object (immutable adapter)', () => {
    const cache = makeRedisCache(null);
    expect(Object.isFrozen(cache)).toBe(true);
  });

  it('delegates get to legacyCache.get', async () => {
    // Spy on the legacy module after requiring it
    const legacyCache = require('../../../src/utilities/cache');
    const spy = jest.spyOn(legacyCache, 'get').mockResolvedValue('hello');
    const cache = makeRedisCache(null);
    const result = await cache.get('mykey');
    expect(spy).toHaveBeenCalledWith('mykey');
    expect(result).toBe('hello');
    spy.mockRestore();
  });

  it('delegates set to legacyCache.set with provided ttl', async () => {
    const legacyCache = require('../../../src/utilities/cache');
    const spy = jest.spyOn(legacyCache, 'set').mockResolvedValue(true);
    const cache = makeRedisCache(null);
    const result = await cache.set('k', 'v', 60);
    expect(spy).toHaveBeenCalledWith('k', 'v', 60);
    expect(result).toBe(true);
    spy.mockRestore();
  });

  it('uses defaultTtlSeconds when ttl is omitted in set', async () => {
    const legacyCache = require('../../../src/utilities/cache');
    const spy = jest.spyOn(legacyCache, 'set').mockResolvedValue(true);
    const cache = makeRedisCache(null, { defaultTtlSeconds: 120 });
    await cache.set('k', 'v');
    expect(spy).toHaveBeenCalledWith('k', 'v', 120);
    spy.mockRestore();
  });

  it('delegates del to legacyCache.del', async () => {
    const legacyCache = require('../../../src/utilities/cache');
    const spy = jest.spyOn(legacyCache, 'del').mockResolvedValue(1);
    const cache = makeRedisCache(null);
    const result = await cache.del('k');
    expect(spy).toHaveBeenCalledWith('k');
    expect(result).toBe(1);
    spy.mockRestore();
  });

  it('delegates delPattern to legacyCache.delPattern', async () => {
    const legacyCache = require('../../../src/utilities/cache');
    const spy = jest.spyOn(legacyCache, 'delPattern').mockResolvedValue(3);
    const cache = makeRedisCache(null);
    const result = await cache.delPattern('catalog:*');
    expect(spy).toHaveBeenCalledWith('catalog:*');
    expect(result).toBe(3);
    spy.mockRestore();
  });

  it('delegates getOrSet to legacyCache.getOrSet', async () => {
    const legacyCache = require('../../../src/utilities/cache');
    const spy = jest.spyOn(legacyCache, 'getOrSet').mockResolvedValue('computed');
    const loader = jest.fn().mockResolvedValue('computed');
    const cache = makeRedisCache(null);
    const result = await cache.getOrSet('k', 30, loader);
    expect(spy).toHaveBeenCalledWith('k', 30, loader);
    expect(result).toBe('computed');
    spy.mockRestore();
  });

  it('uses defaultTtlSeconds for getOrSet when ttl is null', async () => {
    const legacyCache = require('../../../src/utilities/cache');
    const spy = jest.spyOn(legacyCache, 'getOrSet').mockResolvedValue('x');
    const cache = makeRedisCache(null, { defaultTtlSeconds: 60 });
    const loader = jest.fn();
    await cache.getOrSet('k', null, loader);
    expect(spy).toHaveBeenCalledWith('k', 60, loader);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// makeNullCache — pure in-process no-op; no mocking needed
// ---------------------------------------------------------------------------

describe('makeNullCache — port contract', () => {
  let cache;

  beforeEach(() => {
    cache = makeNullCache();
  });

  it('returns an object with the five required Cache methods', () => {
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
    expect(typeof cache.del).toBe('function');
    expect(typeof cache.delPattern).toBe('function');
    expect(typeof cache.getOrSet).toBe('function');
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(cache)).toBe(true);
  });

  it('get always returns undefined (cache miss)', async () => {
    const result = await cache.get('any-key');
    expect(result).toBeUndefined();
  });

  it('set always returns false (no-op)', async () => {
    const result = await cache.set('k', 'v', 60);
    expect(result).toBe(false);
  });

  it('del always returns 0', async () => {
    const result = await cache.del('k');
    expect(result).toBe(0);
  });

  it('delPattern always returns 0', async () => {
    const result = await cache.delPattern('catalog:*');
    expect(result).toBe(0);
  });

  it('getOrSet always invokes the loader and returns its value', async () => {
    const loader = jest.fn().mockResolvedValue({ data: 'fresh' });
    const result = await cache.getOrSet('k', 300, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: 'fresh' });
  });

  it('getOrSet calls loader on every invocation (never caches)', async () => {
    let calls = 0;
    const loader = () => Promise.resolve(++calls);
    await cache.getOrSet('k', 60, loader);
    await cache.getOrSet('k', 60, loader);
    expect(calls).toBe(2);
  });
});
