require('../../../setup');
'use strict';

/**
 * evaluateAuto use-case unit tests.
 */

jest.mock('../../../../src/services/coupon/infrastructure/candidateRepository');
jest.mock('../../../../src/services/coupon/infrastructure/eligibilityCache');
jest.mock('../../../../src/services/coupon/use-cases/validate');

const candidateRepository = require('../../../../src/services/coupon/infrastructure/candidateRepository');
const eligibilityCache = require('../../../../src/services/coupon/infrastructure/eligibilityCache');
const { validate } = require('../../../../src/services/coupon/use-cases/validate');
const { evaluateAuto } = require('../../../../src/services/coupon/use-cases/evaluateAuto');

const EligibilityVerdict = require('../../../../src/services/coupon/domain/EligibilityVerdict');

beforeEach(() => {
  eligibilityCache.buildKey.mockReturnValue('test:cache:key');
  eligibilityCache.hashCart.mockReturnValue('deadbeef1234');
  eligibilityCache.get.mockResolvedValue(undefined);
  eligibilityCache.set.mockResolvedValue(true);
  candidateRepository.findActiveByTrigger.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

describe('evaluateAuto', () => {
  it('throws when trigger is "code"', async () => {
    await expect(evaluateAuto({ trigger: 'code' })).rejects.toThrow('evaluateAuto requires an auto trigger');
  });

  it('throws when trigger is missing', async () => {
    await expect(evaluateAuto({ trigger: undefined })).rejects.toThrow('evaluateAuto requires an auto trigger');
  });

  it('returns cached result without hitting candidateRepository on cache hit', async () => {
    const cached = [{ coupon: { code: 'auto1' }, discount: { aed: 10 }, verdict: {} }];
    eligibilityCache.get.mockResolvedValue(cached);

    const result = await evaluateAuto({ trigger: 'cart_render', user_id: 'u1', cart: {} });

    expect(result).toEqual(cached);
    expect(candidateRepository.findActiveByTrigger).not.toHaveBeenCalled();
  });

  it('returns empty array when no candidates', async () => {
    candidateRepository.findActiveByTrigger.mockResolvedValue([]);

    const result = await evaluateAuto({ trigger: 'cart_render', user_id: 'u1', cart: {} });

    expect(result).toEqual([]);
  });

  it('groups by stack_group, keeping highest-priority winner per group', async () => {
    const candidates = [
      { _id: '1', code: 'a1', trigger: 'cart_render', priority: 10, stack_group: 'grp1' },
      { _id: '2', code: 'a2', trigger: 'cart_render', priority: 5, stack_group: 'grp1' },
    ];
    candidateRepository.findActiveByTrigger.mockResolvedValue(candidates);

    validate.mockImplementation(({ code }) => Promise.resolve({
      verdict: EligibilityVerdict.pass(),
      discount: { aed: 20 },
      coupon: candidates.find((c) => c.code === code),
    }));

    const result = await evaluateAuto({ trigger: 'cart_render', user_id: 'u1', cart: {} });

    // Only the priority=10 winner should be in the result for grp1
    expect(result.length).toBe(1);
    expect(result[0].coupon.code).toBe('a1');
  });

  it('keeps all null stack_group coupons individually', async () => {
    const candidates = [
      { _id: '1', code: 'n1', trigger: 'cart_render', priority: 10, stack_group: null },
      { _id: '2', code: 'n2', trigger: 'cart_render', priority: 5, stack_group: null },
    ];
    candidateRepository.findActiveByTrigger.mockResolvedValue(candidates);

    validate.mockImplementation(({ code }) => Promise.resolve({
      verdict: EligibilityVerdict.pass(),
      discount: { aed: 10 },
      coupon: candidates.find((c) => c.code === code),
    }));

    const result = await evaluateAuto({ trigger: 'cart_render', user_id: 'u1', cart: {} });

    expect(result.length).toBe(2);
  });

  it('caches the result after evaluation', async () => {
    candidateRepository.findActiveByTrigger.mockResolvedValue([]);

    await evaluateAuto({ trigger: 'signup', user_id: 'u1', cart: {} });

    expect(eligibilityCache.set).toHaveBeenCalledWith('test:cache:key', [], 60);
  });
});
