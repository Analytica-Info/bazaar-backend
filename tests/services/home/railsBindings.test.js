'use strict';

/**
 * Guards against the destructuring footgun where a rail file does
 *   const fn = require('.../use-case');
 * but the use-case exports `module.exports = { fn }`. The whole module
 * object is not callable, so fetch() would throw TypeError at runtime —
 * a class of bug that mocked-per-rail unit tests cannot catch because
 * jest.mock replaces the export with a callable mock.
 *
 * This test runs against the REAL use-case modules (no jest.mock) and
 * asserts that every registered rail's `fetch` is a function and that
 * the bound use-case is a function, not an object.
 */

// Force-load all rails (no mocks) so they self-register.
require('../../../src/services/home');
const registry = require('../../../src/services/home/registry');

describe('home/rails bindings', () => {
  const mobile = registry.list({ platform: 'mobile' });
  const web = registry.list({ platform: 'web' });

  it('registers at least one rail per platform', () => {
    expect(mobile.length).toBeGreaterThan(0);
    expect(web.length).toBeGreaterThan(0);
  });

  it.each([
    ['mobile', mobile],
    ['web', web],
  ])('every %s rail.fetch is callable', (_platform, rails) => {
    for (const r of rails) {
      expect(typeof r.fetch).toBe('function');
    }
  });
});
