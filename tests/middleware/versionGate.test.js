'use strict';

/**
 * versionGate middleware tests.
 *
 * Uses unit-style mocks for fast isolation, plus a real Express + supertest
 * integration section to confirm end-to-end 426 vs 200 behavior.
 */

// ── module-level mock for runtimeConfig ──────────────────────────────────────

const mockMobile = {
  minSupportedVersion: '1.0.35',
  enforceMinVersion: true,
  updateUrls: {
    ios:     'https://apps.apple.com/app/bazaar/id0000000000',
    android: 'https://play.google.com/store/apps/details?id=com.bazaar.app',
  },
};

jest.mock('../../src/config/runtime', () => ({
  mobile: mockMobile,
}));

jest.mock('../../src/utilities/logger', () => ({
  warn:  jest.fn(),
  info:  jest.fn(),
  error: jest.fn(),
}));

const versionGate = require('../../src/middleware/versionGate');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');
const logger = require('../../src/utilities/logger');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeReq({ version, ua, log } = {}) {
  return mockReq({
    headers: {
      ...(version !== undefined && { 'x-app-version': version }),
      ...(ua      !== undefined && { 'user-agent': ua }),
    },
    originalUrl: '/api/test',
    ...(log && { log }),
  });
}

// ── unit tests ────────────────────────────────────────────────────────────────

describe('versionGate middleware — unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Defaults: enforce=true, min=1.0.35
    mockMobile.enforceMinVersion = true;
    mockMobile.minSupportedVersion = '1.0.35';
  });

  // ── bypass cases ────────────────────────────────────────────────────────────

  it('calls next() when x-app-version header is absent (web bypass)', () => {
    const req  = makeReq();          // no version header
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  // ── version OK ──────────────────────────────────────────────────────────────

  it('calls next() when version meets minimum (enforce=true)', () => {
    const req  = makeReq({ version: '1.0.35' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when version exceeds minimum (enforce=true)', () => {
    const req  = makeReq({ version: '1.0.40' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  // ── stale version + enforce=true ────────────────────────────────────────────

  it('returns 426 when version is stale and enforce=true', () => {
    const req  = makeReq({ version: '1.0.30' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(426);
    expect(next).not.toHaveBeenCalled();
  });

  it('426 body has correct envelope shape', () => {
    const req  = makeReq({ version: '1.0.30' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({
      forceUpdate:    true,
      currentVersion: '1.0.30',
      minimumVersion: '1.0.35',
      message:        expect.any(String),
    });
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('426 body includes iOS updateUrl when UA contains ios', () => {
    const req  = makeReq({ version: '1.0.30', ua: 'Bazaar/1.0.30 iOS/17.0' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.updateUrl).toBe(mockMobile.updateUrls.ios);
  });

  it('426 body includes Android updateUrl when UA contains android', () => {
    const req  = makeReq({ version: '1.0.30', ua: 'Bazaar/1.0.30 Android/14' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.updateUrl).toBe(mockMobile.updateUrls.android);
  });

  it('426 body has null updateUrl when UA is absent', () => {
    const req  = makeReq({ version: '1.0.30' }); // no UA
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.updateUrl).toBeNull();
  });

  it('426 body has null updateUrl when UA matches neither platform', () => {
    const req  = makeReq({ version: '1.0.30', ua: 'curl/7.88.0' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.updateUrl).toBeNull();
  });

  // ── stale version + enforce=false ───────────────────────────────────────────

  it('calls next() when version is stale but enforce=false', () => {
    mockMobile.enforceMinVersion = false;

    const req  = makeReq({ version: '1.0.30' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('logs a warn when version is stale and enforce=false (module logger fallback)', () => {
    mockMobile.enforceMinVersion = false;

    const req  = makeReq({ version: '1.0.30' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [meta] = logger.warn.mock.calls[0];
    expect(meta.versionGate).toMatchObject({
      clientVersion:  '1.0.30',
      minimumVersion: '1.0.35',
    });
  });

  it('uses req.log.warn when available (enforce=false)', () => {
    mockMobile.enforceMinVersion = false;

    const reqLog = { warn: jest.fn() };
    const req    = makeReq({ version: '1.0.30', log: reqLog });
    const res    = mockRes();
    const next   = mockNext();

    versionGate(req, res, next);

    expect(reqLog.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // ── malformed header ────────────────────────────────────────────────────────

  it('fails open (calls next) when x-app-version is a random string', () => {
    const req  = makeReq({ version: 'not-a-semver' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    // isVersionLess returns false on malformed → not less → next()
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('fails open when x-app-version is an empty string', () => {
    // Empty string is treated as "absent" by the header check
    const req  = mockReq({ headers: { 'x-app-version': '' }, originalUrl: '/test' });
    const res  = mockRes();
    const next = mockNext();

    versionGate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── integration tests — real Express + supertest ──────────────────────────────

const express = require('express');
const request = require('supertest');

function buildApp(mobileOverrides = {}) {
  Object.assign(mockMobile, mobileOverrides);

  const app = express();

  // Simulate requestContext (assigns req.id + req.log)
  app.use((req, _res, next) => {
    req.id  = 'test-req-id';
    req.log = { warn: jest.fn(), info: jest.fn() };
    next();
  });

  app.use(versionGate);
  app.get('/ping', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('versionGate middleware — integration (supertest)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMobile.enforceMinVersion  = true;
    mockMobile.minSupportedVersion = '1.0.35';
  });

  it('GET /ping without x-app-version → 200', async () => {
    const app = buildApp();
    await request(app).get('/ping').expect(200);
  });

  it('GET /ping with current version (enforce=true) → 200', async () => {
    const app = buildApp();
    await request(app)
      .get('/ping')
      .set('x-app-version', '1.0.35')
      .expect(200, { ok: true });
  });

  it('GET /ping with stale version (enforce=true) → 426', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/ping')
      .set('x-app-version', '1.0.30')
      .set('user-agent', 'Bazaar/1.0.30 iOS/17.0')
      .expect(426);

    expect(res.body).toMatchObject({
      forceUpdate:    true,
      currentVersion: '1.0.30',
      minimumVersion: '1.0.35',
      updateUrl:      mockMobile.updateUrls.ios,
      message:        expect.any(String),
    });
  });

  it('GET /ping with stale version (enforce=false) → 200', async () => {
    const app = buildApp({ enforceMinVersion: false });
    await request(app)
      .get('/ping')
      .set('x-app-version', '1.0.30')
      .expect(200, { ok: true });
  });

  it('GET /ping with Android UA → Android updateUrl in 426', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/ping')
      .set('x-app-version', '1.0.10')
      .set('user-agent', 'Bazaar/1.0.10 Android/14')
      .expect(426);

    expect(res.body.updateUrl).toBe(mockMobile.updateUrls.android);
  });

  it('GET /ping with no UA → null updateUrl in 426', async () => {
    const app = buildApp();
    const res = await request(app)
      .get('/ping')
      .set('x-app-version', '1.0.10')
      .expect(426);

    expect(res.body.updateUrl).toBeNull();
  });
});
