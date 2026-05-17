require('../../../setup');
'use strict';

/**
 * eligibilityCache unit tests.
 */

jest.mock('../../../../src/utilities/cache', () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

const cache = require('../../../../src/utilities/cache');
const eligibilityCache = require('../../../../src/services/coupon/infrastructure/eligibilityCache');

describe('eligibilityCache', () => {
  afterEach(() => jest.clearAllMocks());

  describe('buildKey', () => {
    it('builds a key with the correct prefix', () => {
      const key = eligibilityCache.buildKey({ trigger: 'cart_render', identity: 'user123', cartHash: 'abc123' });
      expect(key).toBe('coupon:eligible:v1:cart_render:user123:abc123');
    });
  });

  describe('hashCart', () => {
    it('produces a 12-character hex string', () => {
      const hash = eligibilityCache.hashCart({ a: 1, b: 2 });
      expect(hash).toMatch(/^[0-9a-f]{12}$/);
    });

    it('produces same hash for {a:1,b:2} and {b:2,a:1} (stable across key order)', () => {
      const h1 = eligibilityCache.hashCart({ a: 1, b: 2 });
      const h2 = eligibilityCache.hashCart({ b: 2, a: 1 });
      expect(h1).toBe(h2);
    });

    it('produces different hashes for different carts', () => {
      const h1 = eligibilityCache.hashCart({ subtotal: 100 });
      const h2 = eligibilityCache.hashCart({ subtotal: 200 });
      expect(h1).not.toBe(h2);
    });

    it('handles empty cart', () => {
      const h = eligibilityCache.hashCart({});
      expect(h).toMatch(/^[0-9a-f]{12}$/);
    });
  });

  describe('get', () => {
    it('returns cached value on hit', async () => {
      cache.get.mockResolvedValue([{ coupon: { code: 'x' } }]);
      const result = await eligibilityCache.get('some:key');
      expect(result).toEqual([{ coupon: { code: 'x' } }]);
    });

    it('returns undefined on cache miss', async () => {
      cache.get.mockResolvedValue(undefined);
      const result = await eligibilityCache.get('missing:key');
      expect(result).toBeUndefined();
    });

    it('returns undefined when cache throws', async () => {
      cache.get.mockRejectedValue(new Error('Redis down'));
      const result = await eligibilityCache.get('err:key');
      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('stores value with default TTL of 60s', async () => {
      cache.set.mockResolvedValue(true);
      const ok = await eligibilityCache.set('my:key', [1, 2, 3]);
      expect(cache.set).toHaveBeenCalledWith('my:key', [1, 2, 3], 60);
      expect(ok).toBe(true);
    });

    it('returns false when cache throws', async () => {
      cache.set.mockRejectedValue(new Error('Redis down'));
      const ok = await eligibilityCache.set('my:key', 'val', 60);
      expect(ok).toBe(false);
    });
  });
});
