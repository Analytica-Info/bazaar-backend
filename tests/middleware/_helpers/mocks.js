'use strict';

/**
 * Shared req/res/next factory for middleware tests.
 */

function mockReq(overrides = {}) {
  const req = {
    cookies: {},
    headers: {},
    header(name) {
      // Express header() is case-insensitive
      const lower = name.toLowerCase();
      // Check headers object (lowercase keys) + Authorization special case
      return this.headers[lower] || this.headers[name] || null;
    },
    ...overrides,
  };
  return req;
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return jest.fn();
}

module.exports = { mockReq, mockRes, mockNext };
