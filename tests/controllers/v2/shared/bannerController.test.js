'use strict';

/**
 * Unit tests for bannerController (v2 shared).
 */

jest.mock('../../../../src/services/bannerService');
jest.mock('../../../../src/utilities/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const { runHandler } = require('../../../_helpers/handlerExec');
const bannerService = require('../../../../src/services/bannerService');
const { getBanners } = require('../../../../src/controllers/v2/shared/bannerController');

function makeReq(overrides = {}) {
  return {
    body: {},
    query: {},
    user: null,
    ...overrides,
  };
}

// ── GET /v2/banners ───────────────────────────────────────────────────────────

describe('bannerController.getBanners', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with wrapped banners array', async () => {
    const mockBanners = [
      { _id: 'b1', name: 'Summer Sale', image: 'https://example.com/banner1.jpg' },
      { _id: 'b2', name: 'New Arrivals', image: 'https://example.com/banner2.jpg' },
    ];
    bannerService.getAllBanners.mockResolvedValue(mockBanners);

    const { statusCode, body } = await runHandler(
      getBanners,
      makeReq(),
      { path: '/v2/banners' }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ banners: mockBanners });
  });

  it('returns 200 with empty banners array when no banners exist', async () => {
    bannerService.getAllBanners.mockResolvedValue([]);

    const { statusCode, body } = await runHandler(
      getBanners,
      makeReq(),
      { path: '/v2/banners' }
    );

    expect(statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.banners).toEqual([]);
  });

  it('returns 500 error envelope when service throws', async () => {
    bannerService.getAllBanners.mockRejectedValue(new Error('DB connection failed'));

    const { statusCode, body } = await runHandler(
      getBanners,
      makeReq(),
      { path: '/v2/banners' }
    );

    expect(statusCode).toBe(500);
    expect(body.success).toBe(false);
  });
});
