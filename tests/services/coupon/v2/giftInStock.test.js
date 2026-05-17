require('../../../setup');
'use strict';

/**
 * GiftInStock predicate unit tests.
 */

const EligibilityVerdict = require('../../../../src/services/coupon/domain/EligibilityVerdict');
const REASONS = require('../../../../src/services/coupon/domain/rejection-reasons');

// Ensure registry is populated
require('../../../../src/services/coupon/predicates/index');
const giftInStock = require('../../../../src/services/coupon/predicates/GiftInStock');

// Mock the repositories module
jest.mock('../../../../src/repositories', () => ({
  products: {
    rawModel: jest.fn(),
  },
}));

const repositories = require('../../../../src/repositories');

function makeProductModel(totalQty) {
  return {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(totalQty != null ? { totalQty } : null),
      }),
    }),
  };
}

describe('GiftInStock predicate', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes when gift_product_id is missing (misconfigured rule)', async () => {
    const verdict = await giftInStock({ type: 'gift_in_stock' }, {});
    expect(verdict.eligible).toBe(true);
  });

  it('passes when totalQty - min_buffer > 0 (totalQty=10, min_buffer=5)', async () => {
    repositories.products.rawModel.mockReturnValue(makeProductModel(10));
    const verdict = await giftInStock(
      { type: 'gift_in_stock', gift_product_id: 'prod1', min_buffer: 5 },
      {}
    );
    expect(verdict.eligible).toBe(true);
  });

  it('fails when totalQty - min_buffer <= 0 (totalQty=5, min_buffer=5)', async () => {
    repositories.products.rawModel.mockReturnValue(makeProductModel(5));
    const verdict = await giftInStock(
      { type: 'gift_in_stock', gift_product_id: 'prod1', min_buffer: 5 },
      {}
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.OUT_OF_STOCK);
  });

  it('passes at exact boundary totalQty=6, min_buffer=5 (available=1)', async () => {
    repositories.products.rawModel.mockReturnValue(makeProductModel(6));
    const verdict = await giftInStock(
      { type: 'gift_in_stock', gift_product_id: 'prod1', min_buffer: 5 },
      {}
    );
    expect(verdict.eligible).toBe(true);
  });

  it('fails when totalQty=0 and no min_buffer (default 0)', async () => {
    repositories.products.rawModel.mockReturnValue(makeProductModel(0));
    const verdict = await giftInStock(
      { type: 'gift_in_stock', gift_product_id: 'prod1' },
      {}
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.OUT_OF_STOCK);
  });

  it('passes when totalQty=1 and no min_buffer (default 0)', async () => {
    repositories.products.rawModel.mockReturnValue(makeProductModel(1));
    const verdict = await giftInStock(
      { type: 'gift_in_stock', gift_product_id: 'prod1' },
      {}
    );
    expect(verdict.eligible).toBe(true);
  });

  it('fails with OUT_OF_STOCK when product not found', async () => {
    repositories.products.rawModel.mockReturnValue(makeProductModel(null));
    const verdict = await giftInStock(
      { type: 'gift_in_stock', gift_product_id: 'prod_missing' },
      {}
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toBe(REASONS.OUT_OF_STOCK);
  });
});
