'use strict';

const mockGet = jest.fn();

jest.mock('axios', () => ({ get: mockGet }));

const { verifyEmailWithVeriEmail } = require('../../src/helpers/verifyEmail');

describe('verifyEmailWithVeriEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns API response data on success', async () => {
    const fakeData = { status: 'valid', disposable: false };
    mockGet.mockResolvedValueOnce({ data: fakeData });

    const result = await verifyEmailWithVeriEmail('user@example.com');

    expect(result).toEqual(fakeData);
    expect(mockGet).toHaveBeenCalledWith(
      'https://api.verimail.io/v3/verify',
      expect.objectContaining({ params: expect.objectContaining({ email: 'user@example.com' }) })
    );
  });

  it('returns null when API call throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('network error'));
    const result = await verifyEmailWithVeriEmail('bad@example.com');
    expect(result).toBeNull();
  });

  it('returns null when API returns 4xx error', async () => {
    mockGet.mockRejectedValueOnce({ response: { data: { error: 'invalid_key' } } });
    const result = await verifyEmailWithVeriEmail('user@example.com');
    expect(result).toBeNull();
  });

  it('passes VERIEMAIL_API_KEY from env', async () => {
    process.env.VERIEMAIL_API_KEY = 'test-key-123';
    mockGet.mockResolvedValueOnce({ data: {} });

    await verifyEmailWithVeriEmail('x@x.com');

    expect(mockGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: expect.objectContaining({ key: 'test-key-123' }) })
    );
  });
});
