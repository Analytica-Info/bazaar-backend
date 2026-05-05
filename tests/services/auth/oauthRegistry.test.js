'use strict';

/**
 * oauthRegistry.test.js
 *
 * Unit tests for the OAuth provider registry (Strategy pattern).
 */

// Isolate the registry from module-level state between tests
// by clearing the jest module registry before each test.
let oauthRegistry;

beforeEach(() => {
    jest.resetModules();
    // Mock the real adapters so registry module load does not call out to Google/Apple
    jest.mock('../../../src/services/auth/adapters/googleVerifier', () => ({
        verifyToken: jest.fn().mockResolvedValue({ email: 'g@test.com', name: 'G', sub: 'gsub' }),
    }));
    jest.mock('../../../src/services/auth/adapters/appleVerifier', () => ({
        verifyToken: jest.fn().mockResolvedValue({ email: 'a@test.com', name: 'A', sub: 'asub' }),
    }));
    oauthRegistry = require('../../../src/services/auth/adapters/oauthRegistry');
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('oauthRegistry', () => {
    describe('list()', () => {
        it('returns pre-registered providers on fresh load', () => {
            expect(oauthRegistry.list()).toEqual(expect.arrayContaining(['google', 'apple']));
        });
    });

    describe('get()', () => {
        it('returns the google verifier', () => {
            const v = oauthRegistry.get('google');
            expect(typeof v.verifyToken).toBe('function');
        });

        it('returns the apple verifier', () => {
            const v = oauthRegistry.get('apple');
            expect(typeof v.verifyToken).toBe('function');
        });

        it('throws status 400 for an unknown provider', () => {
            expect(() => oauthRegistry.get('facebook')).toThrow();
            try {
                oauthRegistry.get('facebook');
            } catch (err) {
                expect(err.status).toBe(400);
                expect(err.message).toMatch(/Unknown OAuth provider/);
            }
        });

        it('error message includes the provider name', () => {
            try {
                oauthRegistry.get('twitter');
            } catch (err) {
                expect(err.message).toContain('twitter');
            }
        });
    });

    describe('register()', () => {
        it('registers a new provider and makes it retrievable via get()', () => {
            const fakeVerifier = { verifyToken: jest.fn() };
            oauthRegistry.register('facebook', fakeVerifier);
            expect(oauthRegistry.get('facebook')).toBe(fakeVerifier);
            expect(oauthRegistry.list()).toContain('facebook');
        });

        it('overwrites an existing provider registration', () => {
            const v1 = { verifyToken: jest.fn() };
            const v2 = { verifyToken: jest.fn() };
            oauthRegistry.register('testprovider', v1);
            oauthRegistry.register('testprovider', v2);
            expect(oauthRegistry.get('testprovider')).toBe(v2);
        });

        it('throws if verifier does not implement verifyToken', () => {
            expect(() => oauthRegistry.register('bad', {})).toThrow(/verifyToken/);
        });

        it('throws if verifier is null', () => {
            expect(() => oauthRegistry.register('null', null)).toThrow();
        });
    });
});
