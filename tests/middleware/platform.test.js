'use strict';

const platform = require('../../src/middleware/platform');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');

describe('platform middleware', () => {
  const cases = [
    // [description, reqOverrides, expectedPlatform]
    ['x-client: web sets platform to web', { headers: { 'x-client': 'web' } }, 'web'],
    ['x-client: mobile sets platform to mobile', { headers: { 'x-client': 'mobile' } }, 'mobile'],
    ['unknown x-client falls through to cookie', { headers: { 'x-client': 'tablet' }, cookies: { user_token: 'abc' } }, 'web'],
    ['no x-client + cookie → web', { cookies: { user_token: 'token' } }, 'web'],
    ['no x-client + Authorization Bearer → mobile', { headers: { authorization: 'Bearer mytoken' } }, 'mobile'],
    ['no x-client + no cookie + no auth → unknown', {}, 'unknown'],
    ['x-client overrides cookie', { headers: { 'x-client': 'mobile' }, cookies: { user_token: 'abc' } }, 'mobile'],
    ['x-client overrides Authorization header', { headers: { 'x-client': 'web', authorization: 'Bearer tok' } }, 'web'],
    ['Authorization without Bearer prefix → unknown', { headers: { authorization: 'Token abc' } }, 'unknown'],
    ['Authorization empty string → unknown', { headers: { authorization: '' } }, 'unknown'],
  ];

  test.each(cases)('%s', (desc, reqOverrides, expectedPlatform) => {
    const req = mockReq(reqOverrides);
    const res = mockRes();
    const next = mockNext();

    platform(req, res, next);

    expect(req.platform).toBe(expectedPlatform);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('always calls next()', () => {
    const next = mockNext();
    platform(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
