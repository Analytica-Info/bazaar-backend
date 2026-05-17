require('../../../setup');
'use strict';

/**
 * Predicate cost-ordering tests.
 *
 * Verifies that validate.js sorts rules cheap→medium→expensive and
 * short-circuits on the first failure, so an expensive predicate is
 * never evaluated when a cheap predicate already fails.
 */

const mongoose = require('mongoose');
const CouponV2 = require('../../../../src/models/CouponV2');
const predicateRegistry = require('../../../../src/services/coupon/predicates/index');
const EligibilityVerdict = require('../../../../src/services/coupon/domain/EligibilityVerdict');
const REASONS = require('../../../../src/services/coupon/domain/rejection-reasons');
const { validate } = require('../../../../src/services/coupon/use-cases/validate');

describe('validate — predicate cost ordering', () => {
  let cheapFn;
  let expensiveFn;

  beforeEach(() => {
    cheapFn = jest.fn().mockReturnValue(EligibilityVerdict.fail(REASONS.NOT_ELIGIBLE, 'cheap fail'));
    expensiveFn = jest.fn().mockReturnValue(EligibilityVerdict.pass());

    // Register temporary predicates for this test
    predicateRegistry.register('__test_cheap__', cheapFn, { cost: 'cheap' });
    predicateRegistry.register('__test_expensive__', expensiveFn, { cost: 'expensive' });
  });

  afterEach(() => jest.clearAllMocks());

  it('evaluates cheap rule first and does NOT call expensive predicate when cheap fails', async () => {
    // Coupon has the expensive rule listed first in the array, cheap second.
    // After cost-sort, cheap must run first and short-circuit.
    CouponV2.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: 'cost_order_test',
        status: 'active',
        max_uses_user: 1,
        uses_remaining: null,
        reward: { type: 'flat', amount: 10 },
        // expensive listed first — should still be sorted after cheap
        rules: [
          { type: '__test_expensive__' },
          { type: '__test_cheap__' },
        ],
      }),
    });

    const { verdict } = await validate({ code: 'cost_order_test', cart: { subtotal: 0 } });

    expect(verdict.eligible).toBe(false);
    expect(cheapFn).toHaveBeenCalledTimes(1);
    expect(expensiveFn).not.toHaveBeenCalled();
  });

  it('evaluates expensive predicate only after all cheap predicates pass', async () => {
    cheapFn.mockReturnValue(EligibilityVerdict.pass()); // cheap passes now

    CouponV2.findOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: 'cost_order_pass_cheap',
        status: 'active',
        max_uses_user: 1,
        uses_remaining: null,
        reward: { type: 'flat', amount: 10 },
        rules: [
          { type: '__test_expensive__' },
          { type: '__test_cheap__' },
        ],
      }),
    });

    await validate({ code: 'cost_order_pass_cheap', cart: { subtotal: 0 } });

    expect(cheapFn).toHaveBeenCalledTimes(1);
    expect(expensiveFn).toHaveBeenCalledTimes(1);
  });
});
