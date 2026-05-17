require('../../../setup');
'use strict';

/**
 * candidateRepository unit tests.
 */

jest.mock('../../../../src/models/CouponV2');

const CouponV2 = require('../../../../src/models/CouponV2');
const candidateRepository = require('../../../../src/services/coupon/infrastructure/candidateRepository');

function makeLeanChain(docs) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(docs),
  };
}

describe('candidateRepository', () => {
  afterEach(() => jest.clearAllMocks());

  describe('findActiveByTrigger', () => {
    it('returns active coupons filtered by trigger', async () => {
      const docs = [{ _id: '1', code: 'auto1', trigger: 'cart_render', priority: 0 }];
      CouponV2.find = jest.fn().mockReturnValue(makeLeanChain(docs));

      const result = await candidateRepository.findActiveByTrigger('cart_render');

      expect(CouponV2.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active', trigger: 'cart_render' })
      );
      expect(result).toEqual(docs);
    });

    it('honours the limit option', async () => {
      const chain = makeLeanChain([]);
      CouponV2.find = jest.fn().mockReturnValue(chain);

      await candidateRepository.findActiveByTrigger('signup', { limit: 25 });

      expect(chain.limit).toHaveBeenCalledWith(25);
    });

    it('uses default limit of 100 when not specified', async () => {
      const chain = makeLeanChain([]);
      CouponV2.find = jest.fn().mockReturnValue(chain);

      await candidateRepository.findActiveByTrigger('signup');

      expect(chain.limit).toHaveBeenCalledWith(100);
    });

    it('correctly handles missing starts_at or ends_at on a doc via $or filters', async () => {
      const chain = makeLeanChain([]);
      CouponV2.find = jest.fn().mockReturnValue(chain);

      await candidateRepository.findActiveByTrigger('code');

      const query = CouponV2.find.mock.calls[0][0];
      // starts_at: null OR starts_at <= now
      expect(query.$or).toBeDefined();
      expect(query.$or.some((c) => c.starts_at === null)).toBe(true);
      // ends_at: null OR ends_at >= now inside $and
      expect(query.$and).toBeDefined();
      const endClause = query.$and[0].$or;
      expect(endClause.some((c) => c.ends_at === null)).toBe(true);
    });

    it('sorts by priority desc, _id asc', async () => {
      const chain = makeLeanChain([]);
      CouponV2.find = jest.fn().mockReturnValue(chain);

      await candidateRepository.findActiveByTrigger('code');

      expect(chain.sort).toHaveBeenCalledWith({ priority: -1, _id: 1 });
    });
  });

  describe('findByCode', () => {
    it('finds a coupon by lowercased, trimmed code', async () => {
      const doc = { _id: '1', code: 'save10' };
      CouponV2.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) });

      const result = await candidateRepository.findByCode(' SAVE10 ');

      expect(CouponV2.findOne).toHaveBeenCalledWith({ code: 'save10' });
      expect(result).toEqual(doc);
    });

    it('returns null when coupon not found', async () => {
      CouponV2.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const result = await candidateRepository.findByCode('nonexistent');
      expect(result).toBeNull();
    });
  });
});
