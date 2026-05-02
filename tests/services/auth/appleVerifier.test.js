'use strict';

/**
 * appleVerifier.test.js
 *
 * Unit tests for the Apple OAuth adapter.
 * Mocks apple-signin-auth and domain/tokenIssuer.decodeToken.
 */

process.env.APPLE_CLIENT_ID = 'com.test.app';
process.env.APPLE_WEB_CLIENT_ID = 'com.test.web';

const mockAppleVerify = jest.fn();

jest.mock('apple-signin-auth', () => ({
    verifyIdToken: mockAppleVerify,
}));

// We need jwt.decode to produce controllable output for web flow tests
const jwt = require('jsonwebtoken');

const appleVerifier = require('../../../src/services/auth/adapters/appleVerifier');

describe('appleVerifier.verifyToken', () => {
    afterEach(() => jest.clearAllMocks());

    describe('mobile flow', () => {
        it('returns normalised profile on success', async () => {
            mockAppleVerify.mockResolvedValueOnce({
                email: 'apple@test.com',
                sub: 'apple-sub-1',
                email_verified: true,
            });

            const profile = await appleVerifier.verifyToken('valid.id.token', { platform: 'mobile' });
            expect(profile.email).toBe('apple@test.com');
            expect(profile.sub).toBe('apple-sub-1');
            expect(profile.email_verified).toBe(true);
        });

        it('throws 401 when apple SDK rejects', async () => {
            mockAppleVerify.mockRejectedValueOnce(new Error('invalid sig'));
            await expect(appleVerifier.verifyToken('bad.token.here', { platform: 'mobile' }))
                .rejects.toMatchObject({ status: 401, message: /Invalid or expired Apple identity token/ });
        });

        it('passes the correct audience to apple SDK', async () => {
            mockAppleVerify.mockResolvedValueOnce({ email: 'a@t.com', sub: 's' });
            await appleVerifier.verifyToken('a.b.c', { platform: 'mobile' });
            expect(mockAppleVerify).toHaveBeenCalledWith('a.b.c', expect.objectContaining({
                audience: 'com.test.app',
                ignoreExpiration: true,
            }));
        });

        it('handles null email from Apple (privacy relay)', async () => {
            mockAppleVerify.mockResolvedValueOnce({ sub: 'sub-only', email: undefined });
            const profile = await appleVerifier.verifyToken('a.b.c', { platform: 'mobile' });
            expect(profile.email).toBeNull();
            expect(profile.sub).toBe('sub-only');
        });
    });

    describe('web flow', () => {
        function buildAppleJwt(payload) {
            // Build a real JWT with the given payload, signing key is irrelevant
            // because the web flow only does jwt.decode (no verification).
            return jwt.sign(payload, 'any-secret');
        }

        it('returns normalised profile for a valid web identity token', async () => {
            const token = buildAppleJwt({
                iss: 'https://appleid.apple.com',
                aud: 'com.test.web',
                sub: 'web-sub-1',
                email: 'web@apple.com',
            });

            const profile = await appleVerifier.verifyToken(token, { platform: 'web' });
            expect(profile.sub).toBe('web-sub-1');
            expect(profile.email).toBe('web@apple.com');
        });

        it('throws 401 for wrong issuer', async () => {
            const token = buildAppleJwt({
                iss: 'https://evil.com',
                aud: 'com.test.web',
                sub: 'sub1',
            });
            await expect(appleVerifier.verifyToken(token, { platform: 'web' }))
                .rejects.toMatchObject({ status: 401, message: /Invalid token issuer/ });
        });

        it('throws 401 for wrong audience', async () => {
            const token = buildAppleJwt({
                iss: 'https://appleid.apple.com',
                aud: 'com.wrong.client',
                sub: 'sub1',
            });
            await expect(appleVerifier.verifyToken(token, { platform: 'web' }))
                .rejects.toMatchObject({ status: 401, message: /Invalid token audience/ });
        });

        it('throws 400 for non-string token', async () => {
            await expect(appleVerifier.verifyToken(null, { platform: 'web' }))
                .rejects.toMatchObject({ status: 400, message: /Invalid identity token/ });
        });
    });
});
