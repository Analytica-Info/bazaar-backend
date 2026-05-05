'use strict';

const { compareSemver, isVersionLess } = require('../../src/utilities/semver');

// ── compareSemver ─────────────────────────────────────────────────────────────

describe('compareSemver', () => {
  const cases = [
    // [description, a, b, expected]
    ['equal versions',              '1.0.0',  '1.0.0',   0],
    ['equal padded versions',       '1.2',    '1.2.0',   0],
    ['patch a < b',                 '1.0.9',  '1.0.10', -1],
    ['patch a > b (1.0.10 wins)',   '1.0.10', '1.0.9',   1],
    ['minor a < b',                 '1.1.0',  '1.2.0',  -1],
    ['minor a > b',                 '1.2.0',  '1.1.0',   1],
    ['major a < b',                 '1.9.9',  '2.0.0',  -1],
    ['major a > b',                 '2.0.0',  '1.9.9',   1],
    ['pre-release tag stripped a',  '1.0.0-beta.1', '1.0.0', 0],
    ['pre-release tag stripped b',  '1.0.1', '1.0.1-rc.2', 0],
    ['whitespace trimmed',          ' 1.2.3 ', '1.2.3',  0],
    ['two-part version coerced',    '1.2',    '1.2.0',   0],
    ['one-part version coerced',    '1',      '1.0.0',   0],
  ];

  test.each(cases)('%s', (_desc, a, b, expected) => {
    expect(compareSemver(a, b)).toBe(expected);
  });

  it('throws on malformed a', () => {
    expect(() => compareSemver('not-a-version', '1.0.0')).toThrow(TypeError);
  });

  it('throws on malformed b', () => {
    expect(() => compareSemver('1.0.0', 'abc')).toThrow(TypeError);
  });

  it('throws on null a', () => {
    expect(() => compareSemver(null, '1.0.0')).toThrow(TypeError);
  });

  it('throws on empty string a', () => {
    expect(() => compareSemver('', '1.0.0')).toThrow(TypeError);
  });
});

// ── isVersionLess ─────────────────────────────────────────────────────────────

describe('isVersionLess', () => {
  const cases = [
    // [description, actual, minimum, expected]
    ['1.0.9 < 1.0.10 (numeric)',    '1.0.9',  '1.0.10',  true],
    ['1.0.10 >= 1.0.9',             '1.0.10', '1.0.9',   false],
    ['equal versions → not less',   '1.2.3',  '1.2.3',   false],
    ['minor less',                  '1.1.0',  '1.2.0',   true],
    ['major less',                  '1.0.0',  '2.0.0',   true],
    ['major greater',               '2.0.0',  '1.0.0',   false],
    // fail-open cases
    ['null actual → fail open',     null,     '1.0.0',   false],
    ['undefined actual → fail open', undefined, '1.0.0', false],
    ['empty string → fail open',    '',       '1.0.0',   false],
    ['non-string actual → fail open', 42,     '1.0.0',   false],
    ['null minimum → fail open',    '1.0.0',  null,      false],
    ['random string actual → fail open', 'abc', '1.0.0', false],
    ['random string minimum → fail open', '1.0.0', 'xyz', false],
    // long string
    ['long string → fail open',     'a'.repeat(50), '1.0.0', false],
    ['long actual only → fail open', '1.' + '0'.repeat(40), '1.0.0', false],
  ];

  test.each(cases)('%s', (_desc, actual, minimum, expected) => {
    expect(isVersionLess(actual, minimum)).toBe(expected);
  });
});
