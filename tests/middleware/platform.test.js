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
    // Behavior change 2026-05-05 (V1-BACKCOMPAT-FINAL-AUDIT.md): requests with
    // no platform indicators now default to 'web' (fresh-browser fallback).
    ['no x-client + no cookie + no auth → web (fresh-browser default)', {}, 'web'],
    ['x-client overrides cookie', { headers: { 'x-client': 'mobile' }, cookies: { user_token: 'abc' } }, 'mobile'],
    ['x-client overrides Authorization header', { headers: { 'x-client': 'web', authorization: 'Bearer tok' } }, 'web'],
    ['Authorization without Bearer prefix → web (fresh-browser default)', { headers: { authorization: 'Token abc' } }, 'web'],
    ['Authorization empty string → web (fresh-browser default)', { headers: { authorization: '' } }, 'web'],
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
