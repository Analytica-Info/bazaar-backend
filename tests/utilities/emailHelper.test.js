'use strict';

const mockFindOne = jest.fn();

jest.mock('../../src/repositories', () => ({
  emailConfigs: { rawModel: () => ({ findOne: mockFindOne }) },
}));

jest.mock('../../src/utilities/logger', () => ({ error: jest.fn() }));

const { getAdminEmail, getCcEmails } = require('../../src/utilities/emailHelper');

describe('getAdminEmail', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => { process.env = OLD_ENV; });

  it('returns adminEmail from DB when config exists', async () => {
    mockFindOne.mockResolvedValueOnce({ isActive: true, adminEmail: 'admin@shop.com' });
    expect(await getAdminEmail()).toBe('admin@shop.com');
  });

  it('falls back to ADMIN_EMAIL env when DB returns null', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    process.env.ADMIN_EMAIL = 'env-admin@shop.com';
    expect(await getAdminEmail()).toBe('env-admin@shop.com');
  });

  it('returns empty string when DB null and ADMIN_EMAIL not set', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    delete process.env.ADMIN_EMAIL;
    expect(await getAdminEmail()).toBe('');
  });

  it('falls back to ENV when DB throws', async () => {
    mockFindOne.mockRejectedValueOnce(new Error('DB down'));
    process.env.ADMIN_EMAIL = 'fallback@shop.com';
    expect(await getAdminEmail()).toBe('fallback@shop.com');
  });
});

describe('getCcEmails', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => { process.env = OLD_ENV; });

  it('returns ccEmails array from DB', async () => {
    mockFindOne.mockResolvedValueOnce({
      isActive: true,
      ccEmails: ['cc1@x.com', 'cc2@x.com'],
    });
    expect(await getCcEmails()).toEqual(['cc1@x.com', 'cc2@x.com']);
  });

  it('filters out falsy/empty entries from DB', async () => {
    mockFindOne.mockResolvedValueOnce({
      isActive: true,
      ccEmails: ['cc@x.com', '', null, '  '],
    });
    const result = await getCcEmails();
    // only truthy entries pass filter
    expect(result).toContain('cc@x.com');
    expect(result).not.toContain('');
  });

  it('falls back to CC_MAILS env when DB returns null', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    process.env.CC_MAILS = 'a@x.com, b@x.com';
    const result = await getCcEmails();
    expect(result).toEqual(['a@x.com', 'b@x.com']);
  });

  it('returns empty array when DB null and CC_MAILS not set', async () => {
    mockFindOne.mockResolvedValueOnce(null);
    delete process.env.CC_MAILS;
    expect(await getCcEmails()).toEqual([]);
  });

  it('falls back to CC_MAILS env when DB throws', async () => {
    mockFindOne.mockRejectedValueOnce(new Error('DB down'));
    process.env.CC_MAILS = 'x@x.com';
    const result = await getCcEmails();
    expect(result).toContain('x@x.com');
  });
});
