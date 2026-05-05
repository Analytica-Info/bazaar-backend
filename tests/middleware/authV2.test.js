'use strict';

/**
 * Unit tests for src/middleware/authV2.js
 * All Mongoose models and the cache utility are mocked — no DB required.
 */

process.env.JWT_SECRET = 'authV2-test-secret';
process.env.CACHE_ENABLED = 'false';

const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;

// ── mocks ────────────────────────────────────────────────────────────────────

const mockUserFindById = jest.fn();
const mockAdminFindById = jest.fn();

jest.mock('../../src/repositories', () => ({
  users: {
    rawModel: () => ({
      findById: mockUserFindById,
      updateOne: jest.fn().mockReturnValue({ catch: jest.fn() }),
    }),
  },
  admins: {
    rawModel: () => ({ findById: mockAdminFindById }),
  },
}));

jest.mock('../../src/utilities/cache', () => ({
  key: (...parts) => parts.join(':'),
  get: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/utilities/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
}));

const cache = require('../../src/utilities/cache');
const authV2 = require('../../src/middleware/authV2');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeToken(payload, opts = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h', ...opts });
}

function makeExpiredToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: -1 });
}

const fakeUser = {
  _id: 'uid-001',
  isBlocked: false,
  name: 'Alice',
  email: 'alice@example.com',
};

const fakeAdmin = { _id: 'adm-001', isBlocked: false, role: 'superadmin' };

function chainSelect(returnVal) {
  return {
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(returnVal) }),
    populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(returnVal) }),
    lean: jest.fn().mockResolvedValue(returnVal),
  };
}

// ── required() tests ─────────────────────────────────────────────────────────

describe('authV2.required()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindById.mockReturnValue(chainSelect(fakeUser));
    mockAdminFindById.mockReturnValue(chainSelect(fakeAdmin));
  });

  it('returns 401 when no token is provided', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await authV2.required()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticates via Authorization header', async () => {
    const token = makeToken({ id: 'uid-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    await authV2.required()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(fakeUser);
    expect(req.userRole).toBe('user');
  });

  it('authenticates via cookie', async () => {
    const token = makeToken({ id: 'uid-001' });
    const req = mockReq({ cookies: { user_token: token } });
    const res = mockRes();
    const next = mockNext();

    await authV2.required()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 for expired token', async () => {
    const token = makeExpiredToken({ id: 'uid-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    await authV2.required()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('TOKEN_EXPIRED');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for malformed token', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer not.a.jwt' } });
    const res = mockRes();
    const next = mockNext();

    await authV2.required()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('INVALID_TOKEN');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when user not found in DB', async () => {
    mockUserFindById.mockReturnValue(chainSelect(null));
    const token = makeToken({ id: 'uid-ghost' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    await authV2.required()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user is blocked', async () => {
    mockUserFindById.mockReturnValue(chainSelect({ ...fakeUser, isBlocked: true }));
    const token = makeToken({ id: 'uid-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    await authV2.required()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets lastSeen throttle via cache (cache miss)', async () => {
    cache.get.mockResolvedValueOnce(undefined);
    const token = makeToken({ id: 'uid-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });

    await authV2.required()(req, mockRes(), mockNext());

    expect(cache.set).toHaveBeenCalled();
  });

  it('skips cache.set when lastSeen was recently updated (cache hit)', async () => {
    cache.get.mockResolvedValueOnce('1');
    const token = makeToken({ id: 'uid-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });

    await authV2.required()(req, mockRes(), mockNext());

    expect(cache.set).not.toHaveBeenCalled();
  });

  it('uses admin model when role = "admin"', async () => {
    const token = makeToken({ id: 'adm-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    await authV2.required('admin')(req, res, next);

    expect(mockAdminFindById).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userRole).toBe('admin');
  });

  it('returns 500 on unexpected DB error', async () => {
    mockUserFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('DB exploded')),
      }),
    });
    const token = makeToken({ id: 'uid-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    await authV2.required()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── optional() tests ─────────────────────────────────────────────────────────

describe('authV2.optional()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindById.mockReturnValue(chainSelect(fakeUser));
  });

  it('sets req.user = null and calls next when no token', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await authV2.optional()(req, res, next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('authenticates and sets req.user when valid token present', async () => {
    const token = makeToken({ id: 'uid-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const next = mockNext();

    await authV2.optional()(req, mockRes(), next);

    expect(req.user).toEqual(fakeUser);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 on expired token even in optional mode', async () => {
    const token = makeExpiredToken({ id: 'uid-001' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    await authV2.optional()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
