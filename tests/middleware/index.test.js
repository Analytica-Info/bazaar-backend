'use strict';

jest.mock('../../src/utilities/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  child: jest.fn().mockReturnValue({ debug: jest.fn(), info: jest.fn() }),
}));

describe('middleware barrel (index.js)', () => {
  let barrel;

  beforeAll(() => {
    barrel = require('../../src/middleware/index');
  });

  const exports = [
    'asyncHandler',
    'errorHandler',
    'notFound',
    'validate',
    'requestContext',
    'securityHeaders',
  ];

  test.each(exports.map((e) => [e]))('exports %s as a function', (name) => {
    expect(typeof barrel[name]).toBe('function');
  });
});
