'use strict';

/**
 * Unit tests for couponController (v2 shared).
 */

jest.mock('../../../../src/services/couponService');
jest.mock('../../../../src/utilities/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const { runHandler } = require('../../../_helpers/handlerExec');
const couponService = require('../../../../src/services/couponService');
const { getCoupons, validateCoupon } = require('../../../../src/controllers/v2/shared/couponController');

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    body: {},
    query: {},
    user: null,
    ...overrides,
  };
}

// ── GET /v2/coupons ───────────────────────────────────────────────────────────

describe('couponController.getCoupons', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with wrapped coupon data', async () => {
    couponService.getCoupons.mockResolvedValue({ success: true, count: 5 });

    const { statusCode, body } = await runHandler(
      getCoupons,
      makeReq(),
      { path: '/v2/coupons' }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ count: 5 });
  });

  it('works for anonymous users (no auth required)', async () => {
    couponService.getCoupons.mockResolvedValue({ success: true, count: 0 });

    const { statusCode, body } = await runHandler(
      getCoupons,
      makeReq({ user: null }),
      { path: '/v2/coupons' }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 500 with COUPONS_FETCH_FAILED when service throws', async () => {
    couponService.getCoupons.mockRejectedValue(new Error('DB down'));

    const { statusCode, body } = await runHandler(
      getCoupons,
      makeReq(),
      { path: '/v2/coupons' }
    );

    expect(statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('COUPONS_FETCH_FAILED');
  });
});

// ── POST /v2/coupons/validate ─────────────────────────────────────────────────

describe('couponController.validateCoupon', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with valid:true and service payload for a valid code', async () => {
    couponService.checkCouponCode.mockResolvedValue({
      success: true,
      message: 'Coupon code is valid.',
      type: 'coupon',
      discountPercent: 10,
      capAED: 30,
    });

    const { statusCode, body } = await runHandler(
      validateCoupon,
      makeReq({ body: { couponCode: 'FIRST15' } }),
      { path: '/v2/coupons/validate' }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(true);
    expect(body.data.discountPercent).toBe(10);
    expect(body.data.capAED).toBe(30);
    expect(body.message).toBe('Coupon code is valid.');
  });

  it('works for anonymous user (no auth header)', async () => {
    couponService.checkCouponCode.mockResolvedValue({
      success: true,
      message: 'Coupon code is valid.',
      type: 'coupon',
      discountPercent: 10,
      capAED: null,
    });

    const { statusCode, body } = await runHandler(
      validateCoupon,
      makeReq({ body: { couponCode: 'FIRST15' }, user: null }),
      { path: '/v2/coupons/validate' }
    );

    expect(statusCode).toBe(200);
    expect(body.data.valid).toBe(true);
    expect(couponService.checkCouponCode).toHaveBeenCalledWith('FIRST15', null, expect.any(Object));
  });

  it('returns 400 VALIDATION_ERROR when couponCode is missing', async () => {
    const { statusCode, body } = await runHandler(
      validateCoupon,
      makeReq({ body: {} }),
      { path: '/v2/coupons/validate' }
    );

    expect(statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(couponService.checkCouponCode).not.toHaveBeenCalled();
  });

  it('propagates service error status into v2 error envelope', async () => {
    couponService.checkCouponCode.mockRejectedValue({
      status: 400,
      message: 'Coupon/promo code is not valid or has already been used.',
    });

    const { statusCode, body } = await runHandler(
      validateCoupon,
      makeReq({ body: { couponCode: 'BADCODE' } }),
      { path: '/v2/coupons/validate' }
    );

    expect(statusCode).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('COUPON_INVALID');
    expect(body.error.message).toContain('not valid');
  });

  it('returns 500 on unexpected service error', async () => {
    couponService.checkCouponCode.mockRejectedValue(new Error('Unexpected DB error'));

    const { statusCode, body } = await runHandler(
      validateCoupon,
      makeReq({ body: { couponCode: 'FIRST15' } }),
      { path: '/v2/coupons/validate' }
    );

    expect(statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('COUPON_VALIDATION_FAILED');
  });
});
