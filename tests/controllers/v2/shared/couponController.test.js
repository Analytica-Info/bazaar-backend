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
const { getIssuanceCount: getCoupons } = require('../../../../src/controllers/v2/shared/couponController');

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    body: {},
    query: {},
    user: null,
    ...overrides,
  };
}

// ── GET /v2/coupons/issuance-count ────────────────────────────────────────────

describe('couponController.getIssuanceCount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with wrapped coupon data', async () => {
    couponService.getCoupons.mockResolvedValue({ success: true, count: 5 });

    const { statusCode, body } = await runHandler(
      getCoupons,
      makeReq(),
      { path: '/v2/coupons/issuance-count' }
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
      { path: '/v2/coupons/issuance-count' }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 500 with COUPONS_FETCH_FAILED when service throws', async () => {
    couponService.getCoupons.mockRejectedValue(new Error('DB down'));

    const { statusCode, body } = await runHandler(
      getCoupons,
      makeReq(),
      { path: '/v2/coupons/issuance-count' }
    );

    expect(statusCode).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('COUPONS_FETCH_FAILED');
  });
});


