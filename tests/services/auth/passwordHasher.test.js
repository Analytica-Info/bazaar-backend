'use strict';

/**
 * passwordHasher.test.js — pure unit tests for domain/passwordHasher.js
 */

const passwordHasher = require('../../../src/services/auth/domain/passwordHasher');

describe('passwordHasher.hash', () => {
    it('returns a string', async () => {
        const h = await passwordHasher.hash('MyPassword1!');
        expect(typeof h).toBe('string');
    });

    it('produces a bcrypt hash (starts with $2b$)', async () => {
        const h = await passwordHasher.hash('Test@1234');
        expect(h).toMatch(/^\$2[ab]\$/);
    });

    it('two hashes of the same input differ (salted)', async () => {
        const h1 = await passwordHasher.hash('SamePass1!');
        const h2 = await passwordHasher.hash('SamePass1!');
        expect(h1).not.toBe(h2);
    });
});

describe('passwordHasher.compare', () => {
    it('returns true when password matches hash', async () => {
        const h = await passwordHasher.hash('Correct1!');
        expect(await passwordHasher.compare('Correct1!', h)).toBe(true);
    });

    it('returns false when password does not match', async () => {
        const h = await passwordHasher.hash('Correct1!');
        expect(await passwordHasher.compare('Wrong1!', h)).toBe(false);
    });

    it('returns false for empty string against hash', async () => {
        const h = await passwordHasher.hash('NonEmpty1!');
        expect(await passwordHasher.compare('', h)).toBe(false);
    });
});
