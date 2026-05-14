'use strict';

const mockFindById = jest.fn();

jest.mock('../../src/repositories', () => ({
  admins: { rawModel: () => ({ findById: mockFindById }) },
  roles: { rawModel: () => ({}) },
  permissions: { rawModel: () => ({}) },
}));

jest.mock('../../src/utilities/logger', () => ({ error: jest.fn() }));

const { checkPermission, checkAnyPermission } = require('../../src/middleware/permissionMiddleware');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');

const activePermA = { slug: 'manage-orders', isActive: true };
const activePermB = { slug: 'manage-products', isActive: true };
const inactivePerm = { slug: 'manage-users', isActive: false };

function makeAdmin(roleOverride = {}) {
  return {
    _id: 'adm-1',
    role: { _id: 'role-1', isActive: true, permissions: [activePermA, activePermB], ...roleOverride },
  };
}

function populatedAdmin(roleOverride = {}) {
  const admin = makeAdmin(roleOverride);
  mockFindById.mockReturnValue({
    populate: jest.fn().mockResolvedValue(admin),
  });
  return admin;
}

describe('checkPermission', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next when admin has required permission', async () => {
    const admin = populatedAdmin();
    const req = mockReq({ user: admin });
    const next = mockNext();

    await checkPermission('manage-orders')(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when permission slug does not match', async () => {
    populatedAdmin();
    const req = mockReq({ user: makeAdmin() });
    const res = mockRes();
    await checkPermission('delete-everything')(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when permission is inactive', async () => {
    const admin = { _id: 'adm-1', role: { _id: 'role-1', isActive: true, permissions: [inactivePerm] } };
    mockFindById.mockReturnValue({ populate: jest.fn().mockResolvedValue(admin) });
    const req = mockReq({ user: admin });
    const res = mockRes();
    await checkPermission('manage-users')(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 401 when req.user is missing', async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    await checkPermission('manage-orders')(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 403 when admin has no role', async () => {
    const req = mockReq({ user: { _id: 'adm-1', role: null } });
    const res = mockRes();
    await checkPermission('manage-orders')(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when role is inactive', async () => {
    const admin = { _id: 'adm-1', role: { _id: 'role-1', isActive: false, permissions: [activePermA] } };
    mockFindById.mockReturnValue({ populate: jest.fn().mockResolvedValue(admin) });
    const req = mockReq({ user: admin });
    const res = mockRes();
    await checkPermission('manage-orders')(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 500 on DB error', async () => {
    mockFindById.mockReturnValue({ populate: jest.fn().mockRejectedValue(new Error('DB')) });
    const req = mockReq({ user: makeAdmin() });
    const res = mockRes();
    await checkPermission('manage-orders')(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('checkAnyPermission', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next when admin has at least one of required permissions', async () => {
    populatedAdmin();
    const req = mockReq({ user: makeAdmin() });
    const next = mockNext();
    await checkAnyPermission(['manage-orders', 'super-admin'])(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when admin has none of the required permissions', async () => {
    populatedAdmin();
    const req = mockReq({ user: makeAdmin() });
    const res = mockRes();
    await checkAnyPermission(['delete-everything', 'super-admin'])(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when req.user is missing', async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    await checkAnyPermission(['manage-orders'])(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 500 on DB error', async () => {
    mockFindById.mockReturnValue({ populate: jest.fn().mockRejectedValue(new Error('DB')) });
    const req = mockReq({ user: makeAdmin() });
    const res = mockRes();
    await checkAnyPermission(['manage-orders'])(req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
