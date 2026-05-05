'use strict';

const { escapeRegex } = require('../../src/utilities/stringUtils');

describe('escapeRegex', () => {
  const cases = [
    // [description, input, expected]
    ['plain string unchanged', 'hello', 'hello'],
    ['escapes dot', 'a.b', 'a\\.b'],
    ['escapes asterisk', 'a*b', 'a\\*b'],
    ['escapes plus', 'a+b', 'a\\+b'],
    ['escapes question mark', 'a?b', 'a\\?b'],
    ['escapes caret', 'a^b', 'a\\^b'],
    ['escapes dollar', 'a$b', 'a\\$b'],
    ['escapes open brace', 'a{b', 'a\\{b'],
    ['escapes close brace', 'a}b', 'a\\}b'],
    ['escapes open paren', 'a(b', 'a\\(b'],
    ['escapes close paren', 'a)b', 'a\\)b'],
    ['escapes pipe', 'a|b', 'a\\|b'],
    ['escapes open bracket', 'a[b', 'a\\[b'],
    ['escapes backslash', 'a\\b', 'a\\\\b'],
    ['escapes multiple chars', '(a.b)*', '\\(a\\.b\\)\\*'],
    ['empty string', '', ''],
    ['unicode unchanged', 'café', 'café'],
    ['SQL injection chars', "'; DROP TABLE--", "'; DROP TABLE--"],
    ['emoji unchanged', '🎉', '🎉'],
    ['spaces unchanged', 'hello world', 'hello world'],
  ];

  test.each(cases)('%s', (desc, input, expected) => {
    expect(escapeRegex(input)).toBe(expected);
  });

  it('result is usable in a RegExp without throwing', () => {
    const dangerous = 'a(b.c)*d+e?';
    expect(() => new RegExp(escapeRegex(dangerous))).not.toThrow();
  });
});
