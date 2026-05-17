'use strict';

/**
 * Unit tests for homeController.getHomeManifest.
 *
 * Uses the runHandler helper so we can assert res status/headers without
 * mounting an actual Express server or hitting Redis.
 */

jest.mock('../../../../src/services/home/use-cases/buildHomeManifest');
jest.mock('../../../../src/utilities/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

const { runHandler } = require('../../../_helpers/handlerExec');
const buildHomeManifest = require('../../../../src/services/home/use-cases/buildHomeManifest');
const { getHomeManifest } = require('../../../../src/controllers/v2/shared/homeController');

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeManifest(platform = 'mobile', railOverrides = []) {
  const rails = railOverrides.length
    ? railOverrides
    : [
        { name: 'new-arrivals', status: 'ok', data: { products: [] }, version: 'abc123def456', ttl: 60 },
        { name: 'trending', status: 'ok', data: { products: [] }, version: 'def456abc789', ttl: 60 },
      ];
  return { version: 1, platform, generatedAt: '2026-05-11T10:00:00.000Z', rails };
}

function makeReq(platform = 'mobile', extraHeaders = {}, query = {}) {
  return {
    platform,
    headers: { ...extraHeaders },
    query,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('homeController.getHomeManifest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('200 happy path', () => {
    it('returns 200 with wrapped manifest and ETag header', async () => {
      buildHomeManifest.mockResolvedValue(makeManifest('mobile'));

      const { statusCode, body, headers } = await runHandler(
        getHomeManifest,
        makeReq('mobile'),
        { path: '/v2/home' }
      );

      expect(statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.platform).toBe('mobile');
      expect(body.data.rails).toHaveLength(2);
      expect(headers['ETag']).toMatch(/^W\/"[0-9a-f]{16}"$/);
      expect(headers['Cache-Control']).toBe('public, max-age=60, stale-while-revalidate=300');
    });
  });

  describe('304 Not Modified', () => {
    it('returns 304 when If-None-Match matches ETag', async () => {
      const manifest = makeManifest('mobile');
      buildHomeManifest.mockResolvedValue(manifest);

      // First request to discover the ETag
      const first = await runHandler(getHomeManifest, makeReq('mobile'), { path: '/v2/home' });
      const etag = first.headers['ETag'];

      // Second request with matching If-None-Match
      const second = await runHandler(
        getHomeManifest,
        makeReq('mobile', { 'if-none-match': etag }),
        { path: '/v2/home' }
      );

      expect(second.statusCode).toBe(304);
      expect(second.headers['ETag']).toBe(etag);
      // body should be empty / falsy for 304
      expect(second.body == null || second.body === '').toBe(true);
    });
  });

  describe('platform differentiation', () => {
    it('returns different manifest for different platforms', async () => {
      const mobileManifest = makeManifest('mobile');
      const webManifest = makeManifest('web', [
        { name: 'categories', status: 'ok', data: {}, version: '000111222333', ttl: 60 },
      ]);

      buildHomeManifest
        .mockResolvedValueOnce(mobileManifest)
        .mockResolvedValueOnce(webManifest);

      const mobileRes = await runHandler(getHomeManifest, makeReq('mobile'), { path: '/v2/home' });
      const webRes = await runHandler(getHomeManifest, makeReq('web'), { path: '/v2/home' });

      expect(mobileRes.body.data.platform).toBe('mobile');
      expect(webRes.body.data.platform).toBe('web');
      expect(mobileRes.headers['ETag']).not.toBe(webRes.headers['ETag']);
    });
  });

  describe('error handling', () => {
    it('returns 500 with HOME_MANIFEST_FAILED when buildHomeManifest throws', async () => {
      buildHomeManifest.mockRejectedValue(new Error('Redis exploded'));

      const { statusCode, body } = await runHandler(
        getHomeManifest,
        makeReq('mobile'),
        { path: '/v2/home' }
      );

      expect(statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('HOME_MANIFEST_FAILED');
    });
  });

  describe('query param parsing', () => {
    it('passes rails filter to buildHomeManifest when ?rails= is provided', async () => {
      buildHomeManifest.mockResolvedValue(makeManifest('mobile'));

      await runHandler(
        getHomeManifest,
        makeReq('mobile', {}, { rails: 'new-arrivals,trending' }),
        { path: '/v2/home' }
      );

      expect(buildHomeManifest).toHaveBeenCalledWith(
        expect.objectContaining({ rails: ['new-arrivals', 'trending'] })
      );
    });

    it('ignores malformed ?params= and still returns 200', async () => {
      buildHomeManifest.mockResolvedValue(makeManifest('mobile'));

      const { statusCode } = await runHandler(
        getHomeManifest,
        makeReq('mobile', {}, { params: '{bad json' }),
        { path: '/v2/home' }
      );

      expect(statusCode).toBe(200);
    });
  });
});
