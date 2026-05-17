'use strict';

process.env.JWT_SECRET = 'admin-mw-test-secret';

const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;

const mockFindById = jest.fn();

jest.mock('../../src/repositories', () => ({
  admins: { rawModel: () => ({ findById: mockFindById }) },
  users: { rawModel: () => ({}) },
}));

jest.mock('../../src/utilities/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const adminMiddleware = require('../../src/middleware/adminMiddleware');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');

const fakeAdmin = { _id: 'adm-1', name: 'Admin' };

function makeToken(payload, opts = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h', ...opts });
}

describe('adminMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no token', async () => {
    const res = mockRes();
    await adminMiddleware(mockReq(), res, mockNext());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when admin not found', async () => {
    mockFindById.mockResolvedValueOnce(null);
    const token = makeToken({ id: 'adm-ghost' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    await adminMiddleware(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('authenticates and calls next with valid token', async () => {
    mockFindById.mockResolvedValueOnce(fakeAdmin);
    const token = makeToken({ id: 'adm-1' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = mockNext();

    await adminMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(fakeAdmin);
  });

  it('returns 402 for expired token', async () => {
    const token = jwt.sign({ id: 'adm-1' }, SECRET, { expiresIn: -1 });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    await adminMiddleware(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('returns 401 for malformed token', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer bad.token.here' } });
    const res = mockRes();
    await adminMiddleware(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 500 on unexpected DB error', async () => {
    mockFindById.mockRejectedValueOnce(new Error('DB down'));
    const token = makeToken({ id: 'adm-1' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    await adminMiddleware(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
