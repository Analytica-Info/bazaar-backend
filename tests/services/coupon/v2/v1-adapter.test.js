require('../../../setup');
'use strict';

/**
 * v1-adapter tests — byte-equality of legacy response shapes.
 */

const { toV1Response, REASON_MESSAGES } = require('../../../../src/services/coupon/v1-adapter');
const EligibilityVerdict = require('../../../../src/services/coupon/domain/EligibilityVerdict');
const AppliedDiscount = require('../../../../src/services/coupon/domain/AppliedDiscount');
const REASONS = require('../../../../src/services/coupon/domain/rejection-reasons');

describe('v1-adapter toV1Response', () => {
  // ── success cases ───────────────────────────────────────────────

  it('flat reward → { success: true, discountAmount }', () => {
    const verdict = EligibilityVerdict.pass();
    const discount = new AppliedDiscount({ aed: 25, type: 'flat' });
    const coupon = { reward: { type: 'flat', amount: 25 } };
    const result = toV1Response({ verdict, discount, coupon });
    expect(result.success).toBe(true);
    expect(result.discountAmount).toBe(25);
    expect(result.discountPercent).toBeUndefined();
  });

  it('percent reward → { success: true, discountPercent, capAED }', () => {
    const verdict = EligibilityVerdict.pass();
    const discount = new AppliedDiscount({ aed: 15, type: 'percent' });
    const coupon = { reward: { type: 'percent', percent: 15, cap_aed: 30 } };
    const result = toV1Response({ verdict, discount, coupon });
    expect(result.success).toBe(true);
    expect(result.discountPercent).toBe(15);
    expect(result.capAED).toBe(30);
    expect(result.discountAmount).toBeUndefined();
  });

  it('percent reward with null cap → capAED: null', () => {
    const verdict = EligibilityVerdict.pass();
    const discount = new AppliedDiscount({ aed: 10, type: 'percent' });
    const coupon = { reward: { type: 'percent', percent: 10 } };
    const result = toV1Response({ verdict, discount, coupon });
    expect(result.capAED).toBeNull();
  });

  it('free_shipping reward → graceful degradation', () => {
    const verdict = EligibilityVerdict.pass();
    const discount = new AppliedDiscount({ aed: 15, type: 'free_shipping' });
    const coupon = { reward: { type: 'free_shipping' } };
    const result = toV1Response({ verdict, discount, coupon });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/update the app/i);
  });

  it('bxgy reward → graceful degradation', () => {
    const verdict = EligibilityVerdict.pass();
    const discount = new AppliedDiscount({ aed: 30, type: 'bxgy' });
    const coupon = { reward: { type: 'bxgy' } };
    const result = toV1Response({ verdict, discount, coupon });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/update the app/i);
  });

  it('tiered_percent reward → graceful degradation', () => {
    const verdict = EligibilityVerdict.pass();
    const discount = new AppliedDiscount({ aed: 20, type: 'tiered_percent' });
    const coupon = { reward: { type: 'tiered_percent' } };
    const result = toV1Response({ verdict, discount, coupon });
    expect(result.success).toBe(false);
  });

  it('free_gift reward → graceful degradation', () => {
    const verdict = EligibilityVerdict.pass();
    const discount = new AppliedDiscount({ aed: 50, type: 'free_gift' });
    const coupon = { reward: { type: 'free_gift' } };
    const result = toV1Response({ verdict, discount, coupon });
    expect(result.success).toBe(false);
  });

  // ── rejection cases — message must match mobile _mapMessage() ────

  it('NOT_FOUND → contains "not valid"', () => {
    const verdict = EligibilityVerdict.fail(REASONS.NOT_FOUND, 'x');
    const result = toV1Response({ verdict });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not valid/i);
  });

  it('EXPIRED → contains "expired"', () => {
    const verdict = EligibilityVerdict.fail(REASONS.EXPIRED, 'x');
    const result = toV1Response({ verdict });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/expired/i);
  });

  it('ALREADY_USED / USER_CAP_REACHED → contains "already used"', () => {
    for (const reason of [REASONS.ALREADY_USED, REASONS.USER_CAP_REACHED]) {
      const verdict = EligibilityVerdict.fail(reason, 'x');
      const result = toV1Response({ verdict });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/already used/i);
    }
  });

  it('BELOW_MINIMUM → contains "minimum"', () => {
    const verdict = EligibilityVerdict.fail(REASONS.BELOW_MINIMUM, 'x');
    const result = toV1Response({ verdict });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/minimum/i);
  });

  it('FIRST_ORDER_ONLY → contains "first"', () => {
    const verdict = EligibilityVerdict.fail(REASONS.FIRST_ORDER_ONLY, 'x');
    const result = toV1Response({ verdict });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/first/i);
  });

  it('DISABLED → contains "not active"', () => {
    const verdict = EligibilityVerdict.fail(REASONS.DISABLED, 'x');
    const result = toV1Response({ verdict });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not active/i);
  });

  it('NOT_ELIGIBLE → success: false with a message', () => {
    const verdict = EligibilityVerdict.fail(REASONS.NOT_ELIGIBLE, 'x');
    const result = toV1Response({ verdict });
    expect(result.success).toBe(false);
    expect(typeof result.message).toBe('string');
  });
});
