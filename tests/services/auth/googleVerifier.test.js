'use strict';

/**
 * googleVerifier.test.js
 *
 * Unit tests for the Google OAuth adapter.
 * Mocks google-auth-library and axios.
 */

process.env.GOOGLE_CLIENT_ID = 'fake-web-client-id';
process.env.ANDROID_GOOGLE_CLIENT_ID = 'fake-android-client-id';
process.env.IOS_GOOGLE_CLIENT_ID = 'fake-ios-client-id';

const mockVerifyIdToken = jest.fn();
const mockAxiosGet = jest.fn();

jest.mock('google-auth-library', () => ({
    OAuth2Client: jest.fn().mockImplementation(() => ({
        verifyIdToken: mockVerifyIdToken,
    })),
}));

jest.mock('axios', () => ({
    get: mockAxiosGet,
}));

const googleVerifier = require('../../../src/services/auth/adapters/googleVerifier');

describe('googleVerifier.verifyToken', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('accessToken flow', () => {
        it('returns normalised profile on success', async () => {
            mockAxiosGet.mockResolvedValueOnce({
                data: {
                    email: 'user@gmail.com',
                    given_name: 'John',
                    family_name: 'Doe',
                    picture: 'https://pic.url',
                    id: 'google-uid-123',
                },
            });

            const profile = await googleVerifier.verifyToken('bearer-token', { isAccessToken: true });

            expect(profile.email).toBe('user@gmail.com');
            expect(profile.name).toBe('John Doe');
            expect(profile.sub).toBe('google-uid-123');
            expect(profile.picture).toBe('https://pic.url');
            expect(profile.given_name).toBe('John');
            expect(profile.family_name).toBe('Doe');
        });

        it('throws 401 when axios call fails', async () => {
            mockAxiosGet.mockRejectedValueOnce(new Error('network error'));
            await expect(googleVerifier.verifyToken('bad-token', { isAccessToken: true }))
                .rejects.toMatchObject({ status: 401, message: /Invalid or expired Google access token/ });
        });

        it('uses Authorization: Bearer header', async () => {
            mockAxiosGet.mockResolvedValueOnce({
                data: { email: 'u@g.com', given_name: 'U', id: 'sub1' },
            });
            await googleVerifier.verifyToken('my-token', { isAccessToken: true });
            expect(mockAxiosGet).toHaveBeenCalledWith(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                expect.objectContaining({ headers: { Authorization: 'Bearer my-token' } })
            );
        });
    });

    describe('idToken flow', () => {
        it('throws 400 for malformed token (not 3 parts)', async () => {
            await expect(googleVerifier.verifyToken('notajwt', { isAccessToken: false }))
                .rejects.toMatchObject({ status: 400, message: /Invalid tokenId format/ });
        });

        it('returns normalised profile for valid idToken', async () => {
            mockVerifyIdToken.mockResolvedValueOnce({
                getPayload: () => ({
                    email: 'g@test.com',
                    given_name: 'Alice',
                    family_name: 'Smith',
                    picture: 'https://pic.test',
                    sub: 'sub-alice',
                }),
            });

            const profile = await googleVerifier.verifyToken('a.b.c', { isAccessToken: false });
            expect(profile.email).toBe('g@test.com');
            expect(profile.name).toBe('Alice Smith');
            expect(profile.sub).toBe('sub-alice');
        });

        it('throws 401 when verifyIdToken rejects', async () => {
            mockVerifyIdToken.mockRejectedValueOnce(new Error('bad sig'));
            await expect(googleVerifier.verifyToken('a.b.c', { isAccessToken: false }))
                .rejects.toMatchObject({ status: 401, message: /Invalid or expired Google token/ });
        });

        it('selects android client ID for mobile+android platform', async () => {
            mockVerifyIdToken.mockResolvedValueOnce({
                getPayload: () => ({ email: 'a@t.com', given_name: 'A', sub: 's' }),
            });
            await googleVerifier.verifyToken('a.b.c', { isAccessToken: false, platform: 'mobile', userAgent: 'android' });
            // The audience passed to verifyIdToken should be the android client ID
            const call = mockVerifyIdToken.mock.calls[0][0];
            expect(call.audience).toBe('fake-android-client-id');
        });

        it('selects ios client ID for mobile+ios platform', async () => {
            mockVerifyIdToken.mockResolvedValueOnce({
                getPayload: () => ({ email: 'a@t.com', given_name: 'A', sub: 's' }),
            });
            await googleVerifier.verifyToken('a.b.c', { isAccessToken: false, platform: 'mobile', userAgent: 'ios' });
            const call = mockVerifyIdToken.mock.calls[0][0];
            expect(call.audience).toBe('fake-ios-client-id');
        });
    });
});
