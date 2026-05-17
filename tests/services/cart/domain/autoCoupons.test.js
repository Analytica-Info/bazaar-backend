'use strict';

/**
 * Unit tests for src/services/cart/domain/autoCoupons.js
 *
 * All external I/O is mocked — no Mongo or Redis connections.
 */

jest.mock('../../../../src/services/coupon', () => ({
  evaluateAuto: jest.fn(),
}));

jest.mock('../../../../src/services/coupon/infrastructure/candidateRepository', () => ({
  findActiveByTrigger: jest.fn(),
}));

jest.mock('../../../../src/utilities/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

const couponEngine = require('../../../../src/services/coupon');
const candidateRepository = require('../../../../src/services/coupon/infrastructure/candidateRepository');
const logger = require('../../../../src/utilities/logger');
const { resolveAutoGift, nextGiftThreshold } = require('../../../../src/services/cart/domain/autoCoupons');

afterEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// resolveAutoGift
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveAutoGift', () => {
  /** Build a fake engine result entry. */
  function makeResult(couponOverrides = {}, resultOverrides = {}) {
    return {
      coupon: {
        reward: { type: 'free_gift', gift_product_id: 'prod-001', gift_product_name: 'Gift' },
        stack_group: 'gift',
        metadata: { slot: 'cart_threshold_gift' },
        priority: 100,
        ...couponOverrides,
      },
      discount: { aed: 0 },
      verdict: { eligible: true },
      ...resultOverrides,
    };
  }

  it('returns the highest-priority free_gift winner from the engine', async () => {
    const low = makeResult({ priority: 50 });
    const high = makeResult({ priority: 200 });
    couponEngine.evaluateAuto.mockResolvedValue([low, high]);

    const result = await resolveAutoGift({ user_id: 'u1' });

    expect(result).not.toBeNull();
    expect(result.coupon.priority).toBe(200);
    expect(result.discount).toEqual({ aed: 0 });
  });

  it('filters by stack_group === "gift" AND reward.type === "free_gift" AND metadata.slot match', async () => {
    const wrongStack = makeResult({ stack_group: 'promo' });
    const wrongType = makeResult({ reward: { type: 'flat', gift_product_id: 'p1' }, stack_group: 'gift' });
    const wrongSlot = makeResult({ metadata: { slot: 'other_slot' } });
    const correct = makeResult();

    couponEngine.evaluateAuto.mockResolvedValue([wrongStack, wrongType, wrongSlot, correct]);

    const result = await resolveAutoGift({ user_id: 'u1', slot: 'cart_threshold_gift' });

    expect(result).not.toBeNull();
    expect(result.coupon.metadata.slot).toBe('cart_threshold_gift');
    expect(result.coupon.stack_group).toBe('gift');
    expect(result.coupon.reward.type).toBe('free_gift');
  });

  it('returns null when engine returns an empty array', async () => {
    couponEngine.evaluateAuto.mockResolvedValue([]);

    const result = await resolveAutoGift({ user_id: 'u1' });

    expect(result).toBeNull();
  });

  it('returns null (and logs a warn) when engine throws', async () => {
    couponEngine.evaluateAuto.mockRejectedValue(new Error('DB connection error'));

    const result = await resolveAutoGift({ user_id: 'u1' });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('degrading to null'),
    );
  });

  it('returns null when no results pass the filter', async () => {
    const nonGift = makeResult({ reward: { type: 'flat' }, stack_group: 'gift' });
    couponEngine.evaluateAuto.mockResolvedValue([nonGift]);

    const result = await resolveAutoGift({ user_id: 'u1' });

    expect(result).toBeNull();
  });

  it('uses the default slot "cart_threshold_gift" when slot is omitted', async () => {
    const correct = makeResult();
    couponEngine.evaluateAuto.mockResolvedValue([correct]);

    const result = await resolveAutoGift({ user_id: 'u1' });

    expect(result).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nextGiftThreshold
// ─────────────────────────────────────────────────────────────────────────────

describe('nextGiftThreshold', () => {
  function makeCoupon(threshold, overrides = {}) {
    return {
      reward: { type: 'free_gift', gift_product_name: 'Free Gift', gift_product_id: 'prod-001' },
      stack_group: 'gift',
      rules: [{ type: 'min_subtotal', amount: threshold }],
      ...overrides,
    };
  }

  it('returns the lowest min_subtotal across cart_render gift coupons', async () => {
    candidateRepository.findActiveByTrigger.mockResolvedValue([
      makeCoupon(500),
      makeCoupon(300),
      makeCoupon(400),
    ]);

    const result = await nextGiftThreshold({ user_id: 'u1' });

    expect(result).not.toBeNull();
    expect(result.threshold).toBe(300);
  });

  it('returns the gift_name from the coupon with the lowest threshold', async () => {
    candidateRepository.findActiveByTrigger.mockResolvedValue([
      makeCoupon(500, { reward: { type: 'free_gift', gift_product_name: 'Big Gift', gift_product_id: 'p1' } }),
      makeCoupon(200, { reward: { type: 'free_gift', gift_product_name: 'Small Gift', gift_product_id: 'p2' } }),
    ]);

    const result = await nextGiftThreshold({ user_id: 'u1' });

    expect(result.threshold).toBe(200);
    expect(result.gift_name).toBe('Small Gift');
  });

  it('returns null when no gift coupons exist', async () => {
    candidateRepository.findActiveByTrigger.mockResolvedValue([]);

    const result = await nextGiftThreshold({ user_id: 'u1' });

    expect(result).toBeNull();
  });

  it('returns null and logs a warn when candidateRepository throws', async () => {
    candidateRepository.findActiveByTrigger.mockRejectedValue(new Error('timeout'));

    const result = await nextGiftThreshold({ user_id: 'u1' });

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('ignores coupons that are not free_gift type', async () => {
    candidateRepository.findActiveByTrigger.mockResolvedValue([
      {
        reward: { type: 'flat' },
        stack_group: 'gift',
        rules: [{ type: 'min_subtotal', amount: 100 }],
      },
    ]);

    const result = await nextGiftThreshold({ user_id: 'u1' });

    expect(result).toBeNull();
  });
});
