'use strict';

const { isValidPassword } = require('../../src/helpers/validator');

describe('isValidPassword', () => {
  const validPasswords = [
    ['meets all requirements', 'Abcdef1!'],
    ['long password', 'SuperSecure@123'],
    ['with multiple specials', 'P@ssw0rd!#'],
    ['exactly 8 chars', 'Aa1!aaaa'],
    ['with caret special', 'Abc1^def'],
    ['with ampersand', 'Abc1&def'],
  ];

  const invalidPasswords = [
    ['too short (7 chars)', 'Abc1!aa'],
    ['missing uppercase', 'abcdef1!'],
    ['missing digit', 'Abcdefg!'],
    ['missing special char', 'Abcdef12'],
    ['empty string', ''],
    ['all uppercase no special', 'ABCDEF12'],
    ['only spaces', '        '],
    ['null-like undefined string', 'undefined'],
  ];

  test.each(validPasswords)('accepts: %s → %s', (desc, password) => {
    expect(isValidPassword(password)).toBe(true);
  });

  test.each(invalidPasswords)('rejects: %s → %s', (desc, password) => {
    expect(isValidPassword(password)).toBe(false);
  });
});
