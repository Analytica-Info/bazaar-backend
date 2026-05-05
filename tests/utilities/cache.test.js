'use strict';

/**
 * Unit tests for src/utilities/cache.js
 * The Redis client is fully mocked — no real Redis required.
 */

jest.mock('../../src/config/redis', () => ({
  isEnabled: jest.fn().mockReturnValue(true),
  getClient: jest.fn(),
}));

jest.mock('../../src/utilities/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

const redisConfig = require('../../src/config/redis');
const cache = require('../../src/utilities/cache');

// Build a fake Redis client object — done after mocks are set up
const fakeClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
};
const mockGet = fakeClient.get;
const mockSet = fakeClient.set;
const mockDel = fakeClient.del;
const mockScan = fakeClient.scan;

const NS = 'bazaar:';

beforeEach(() => {
  jest.clearAllMocks();
  // Default: cache is enabled and client returns fakeClient
  redisConfig.isEnabled.mockReturnValue(true);
  redisConfig.getClient.mockReturnValue(fakeClient);
});

describe('cache.key()', () => {
  it('joins parts with colons', () => {
    expect(cache.key('catalog', 'top-rated', 'v1')).toBe('catalog:top-rated:v1');
  });

  it('works with a single part', () => {
    expect(cache.key('foo')).toBe('foo');
  });
});

describe('cache.get()', () => {
  it('returns parsed JSON value on hit', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ a: 1 }));
    const result = await cache.get('mykey');
    expect(result).toEqual({ a: 1 });
    expect(mockGet).toHaveBeenCalledWith(`${NS}mykey`);
  });

  it('returns raw string when value is not JSON', async () => {
    mockGet.mockResolvedValueOnce('plain-string');
    const result = await cache.get('k');
    expect(result).toBe('plain-string');
  });

  it('returns undefined on cache miss (null)', async () => {
    mockGet.mockResolvedValueOnce(null);
    const result = await cache.get('miss');
    expect(result).toBeUndefined();
  });

  it('returns undefined and does not throw on Redis error', async () => {
    mockGet.mockRejectedValueOnce(new Error('conn refused'));
    const result = await cache.get('errkey');
    expect(result).toBeUndefined();
  });

  it('returns undefined when cache is disabled', async () => {
    redisConfig.isEnabled.mockReturnValueOnce(false);
    const result = await cache.get('any');
    expect(result).toBeUndefined();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns undefined when client is null', async () => {
    redisConfig.getClient.mockReturnValueOnce(null);
    const result = await cache.get('any');
    expect(result).toBeUndefined();
  });

  it('does not double-namespace already-namespaced keys', async () => {
    mockGet.mockResolvedValueOnce(null);
    await cache.get('bazaar:already-namespaced');
    expect(mockGet).toHaveBeenCalledWith('bazaar:already-namespaced');
  });
});

describe('cache.set()', () => {
  it('stores serialized value with EX TTL', async () => {
    mockSet.mockResolvedValueOnce('OK');
    const result = await cache.set('k', { val: 42 }, 60);
    expect(result).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(`${NS}k`, JSON.stringify({ val: 42 }), 'EX', 60);
  });

  it('stores a plain string without JSON.stringify', async () => {
    mockSet.mockResolvedValueOnce('OK');
    await cache.set('k', 'hello', 30);
    expect(mockSet).toHaveBeenCalledWith(`${NS}k`, 'hello', 'EX', 30);
  });

  it('returns false on Redis error', async () => {
    mockSet.mockRejectedValueOnce(new Error('timeout'));
    const result = await cache.set('k', 'v', 10);
    expect(result).toBe(false);
  });

  it('returns false when disabled', async () => {
    redisConfig.isEnabled.mockReturnValueOnce(false);
    const result = await cache.set('k', 'v', 10);
    expect(result).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('cache.del()', () => {
  it('returns 1 when key exists', async () => {
    mockDel.mockResolvedValueOnce(1);
    const result = await cache.del('k');
    expect(result).toBe(1);
    expect(mockDel).toHaveBeenCalledWith(`${NS}k`);
  });

  it('returns 0 when key does not exist', async () => {
    mockDel.mockResolvedValueOnce(0);
    expect(await cache.del('missing')).toBe(0);
  });

  it('returns 0 on Redis error', async () => {
    mockDel.mockRejectedValueOnce(new Error('err'));
    expect(await cache.del('k')).toBe(0);
  });

  it('returns 0 when disabled', async () => {
    redisConfig.isEnabled.mockReturnValueOnce(false);
    expect(await cache.del('k')).toBe(0);
    expect(mockDel).not.toHaveBeenCalled();
  });
});

describe('cache.delPattern()', () => {
  it('scans and deletes matching keys', async () => {
    mockScan
      .mockResolvedValueOnce([`${NS}catalog:a`, `${NS}catalog:b`])
      .mockResolvedValueOnce(['0', []]);
    // First scan returns keys; ioredis scan returns [cursor, keys]
    mockScan.mockReset();
    mockScan
      .mockResolvedValueOnce(['0', [`${NS}catalog:a`, `${NS}catalog:b`]]);
    mockDel.mockResolvedValueOnce(2);

    const count = await cache.delPattern('catalog:*');
    expect(count).toBe(2);
  });

  it('returns 0 when no keys match', async () => {
    mockScan.mockResolvedValueOnce(['0', []]);
    const count = await cache.delPattern('nope:*');
    expect(count).toBe(0);
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('returns 0 on Redis error', async () => {
    mockScan.mockRejectedValueOnce(new Error('scan err'));
    expect(await cache.delPattern('cat:*')).toBe(0);
  });

  it('returns 0 when disabled', async () => {
    redisConfig.isEnabled.mockReturnValueOnce(false);
    expect(await cache.delPattern('*')).toBe(0);
  });
});

describe('cache.getOrSet()', () => {
  it('returns cached value on hit without calling fetcher', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify('cached'));
    const fetcher = jest.fn();
    const result = await cache.getOrSet('k', 60, fetcher);
    expect(result).toBe('cached');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls fetcher and caches result on miss', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockSet.mockResolvedValueOnce('OK');
    const fetcher = jest.fn().mockResolvedValue([1, 2, 3]);
    const result = await cache.getOrSet('k', 60, fetcher);
    expect(result).toEqual([1, 2, 3]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalled();
  });

  it('caches empty array (falsy-but-valid result)', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockSet.mockResolvedValueOnce('OK');
    const fetcher = jest.fn().mockResolvedValue([]);
    const result = await cache.getOrSet('k', 60, fetcher);
    expect(result).toEqual([]);
    expect(mockSet).toHaveBeenCalled();
  });

  it('falls back to fetcher when cache is disabled', async () => {
    redisConfig.isEnabled.mockReturnValueOnce(false);
    const fetcher = jest.fn().mockResolvedValue('fresh');
    const result = await cache.getOrSet('k', 60, fetcher);
    expect(result).toBe('fresh');
  });

  it('falls back to fetcher on Redis get error', async () => {
    mockGet.mockRejectedValueOnce(new Error('err'));
    const fetcher = jest.fn().mockResolvedValue('fallback');
    const result = await cache.getOrSet('k', 60, fetcher);
    expect(result).toBe('fallback');
  });

  it('returns fetcher value even when set fails', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockSet.mockRejectedValueOnce(new Error('set fail'));
    const fetcher = jest.fn().mockResolvedValue('val');
    const result = await cache.getOrSet('k', 60, fetcher);
    expect(result).toBe('val');
  });
});
