/**
 * authService.coverage.test.js
 * PR11 — Push authService to ≥80% lines / ≥70% branches.
 *
 * Covers:
 *  - Private helpers: getDeviceInfo, upsertSession, generateTokens
 *  - register: mobile platform paths, deleted account recovery flow
 *  - loginWithCredentials: isDeleted, isBlocked, mobile-social-only, rememberMe, fcmToken
 *  - googleLogin: accessToken flow, tokenId flow, new/existing user, web/mobile
 *  - appleLogin: mobile idToken, web identityToken, all error branches
 *  - forgotPassword: deleted user, social provider block
 *  - verifyCode: expired token
 *  - resetPassword: expired, invalid code, mobile platform
 *  - updatePassword: edge cases
 *  - refreshToken: expired, revoked, not found
 *  - checkAccessToken: valid, expired+refresh, expired+no-refresh, invalid
 *  - deleteAccount: already deleted, mobile platform
 *  - deleteAccountPublic: social login, blocked
 *  - verifyRecoveryCode: expired, wrong code, missing fields
 *  - resendRecoveryCode: rate limit, reset attempts after 24h
 *  - updateProfile: missing email, phone, username update
 *  - getUserData: deleted, blocked
 */

process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing';
process.env.GOOGLE_CLIENT_ID = 'fake-google-client-id';
process.env.ANDROID_GOOGLE_CLIENT_ID = 'fake-android-client-id';
process.env.IOS_GOOGLE_CLIENT_ID = 'fake-ios-client-id';
process.env.APPLE_CLIENT_ID = 'com.test.app';
process.env.APPLE_WEB_CLIENT_ID = 'com.test.web';
process.env.ADMIN_EMAIL = 'admin@test.com';

require('../setup');

// ── Stable mock objects (declared BEFORE jest.mock calls — Babel hoisting) ──

const mockGoogleVerifyFn = jest.fn();
const mockAxiosGetFn = jest.fn();
const mockAppleVerifyFn = jest.fn();

jest.mock('google-auth-library', () => ({
    OAuth2Client: jest.fn().mockImplementation(() => ({
        verifyIdToken: mockGoogleVerifyFn,
    })),
}));

jest.mock('axios', () => ({
    get: mockAxiosGetFn,
}));

jest.mock('apple-signin-auth', () => ({
    verifyIdToken: mockAppleVerifyFn,
}));

jest.mock('../../src/mail/emailService', () => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/models/Coupons', () => ({
    findOne: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/helpers/verifyEmail', () => ({
    verifyEmailWithVeriEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/utilities/backendLogger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
}));

// ── Imports ─────────────────────────────────────────────────────────────────

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const clock = require('../../src/utilities/clock');
const authService = require('../../src/services/authService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const VALID_PASSWORD = 'Test@1234';

async function makeUser(overrides = {}) {
    const hashedPassword = await bcrypt.hash(VALID_PASSWORD, 10);
    return User.create({
        name: 'Test User',
        email: `user-${Date.now()}-${Math.random()}@example.com`,
        phone: String(Math.floor(Math.random() * 9000000000) + 1000000000),
        password: hashedPassword,
        authProvider: 'local',
        ...overrides,
    });
}

// ── Private helpers (exported via _helpers) ──────────────────────────────────

describe('authService._helpers.getDeviceInfo', () => {
    const { getDeviceInfo } = authService._helpers;

    it('extracts all fields from headers', () => {
        const info = getDeviceInfo({
            'x-device-id': 'dev-123',
            'user-agent': 'TestAgent/1.0',
            'x-forwarded-for': '10.0.0.1, 10.0.0.2',
            'x-fcm-token': 'fcm-abc',
        });
        expect(info.deviceId).toBe('dev-123');
        expect(info.userAgent).toBe('TestAgent/1.0');
        expect(info.ip).toBe('10.0.0.1');
        expect(info.fcmToken).toBe('fcm-abc');
    });

    it('returns nulls when headers are missing', () => {
        const info = getDeviceInfo({});
        expect(info.deviceId).toBeNull();
        expect(info.userAgent).toBeNull();
        expect(info.ip).toBeNull();
        expect(info.fcmToken).toBeNull();
    });
});

describe('authService._helpers.upsertSession', () => {
    const { upsertSession } = authService._helpers;

    it('creates a new session when no deviceId match', () => {
        const user = { sessions: [] };
        upsertSession(user, { deviceId: 'dev-1', userAgent: 'UA', ip: '1.1.1.1', fcmToken: 'token' }, 'rt1');
        expect(user.sessions).toHaveLength(1);
        expect(user.sessions[0].refreshToken).toBe('rt1');
        expect(user.sessions[0].fcmToken).toBe('token');
    });

    it('updates existing session on matching deviceId', () => {
        const user = {
            sessions: [{
                deviceId: 'dev-1',
                refreshToken: 'old-rt',
                userAgent: 'OldUA',
                ip: '0.0.0.0',
                lastUsed: new Date(0),
                revokedAt: new Date(),
                fcmToken: null,
            }],
        };
        upsertSession(user, { deviceId: 'dev-1', userAgent: 'NewUA', ip: '2.2.2.2', fcmToken: 'new-token' }, 'new-rt');
        expect(user.sessions).toHaveLength(1);
        expect(user.sessions[0].refreshToken).toBe('new-rt');
        expect(user.sessions[0].revokedAt).toBeNull();
        expect(user.sessions[0].fcmToken).toBe('new-token');
    });

    it('generates a stable deviceId when none provided', () => {
        const user = { sessions: [] };
        const deviceId = upsertSession(user, { deviceId: null, userAgent: 'UA', ip: null, fcmToken: null }, 'rt');
        expect(typeof deviceId).toBe('string');
        expect(user.sessions).toHaveLength(1);
    });

    it('prunes sessions beyond MAX_SESSIONS (10)', () => {
        const existing = Array.from({ length: 10 }, (_, i) => ({
            deviceId: `dev-${i}`,
            refreshToken: `rt-${i}`,
            userAgent: 'UA',
            ip: null,
            lastUsed: new Date(i * 1000),
            revokedAt: null,
        }));
        const user = { sessions: [...existing] };
        upsertSession(user, { deviceId: 'dev-new', userAgent: 'UA', ip: null, fcmToken: null }, 'rt-new');
        expect(user.sessions.length).toBeLessThanOrEqual(10);
    });

    it('initializes sessions array if missing', () => {
        const user = {};
        upsertSession(user, { deviceId: 'dev-x', userAgent: null, ip: null, fcmToken: null }, 'rt');
        expect(Array.isArray(user.sessions)).toBe(true);
    });
});

describe('authService._helpers.generateTokens', () => {
    const { generateTokens } = authService._helpers;

    it('generates access and refresh tokens with custom expiry', () => {
        const user = { _id: new mongoose.Types.ObjectId() };
        const { accessToken, refreshToken } = generateTokens(user, { accessExpiry: '2h', refreshExpiry: '30d' });
        const decoded = jwt.verify(accessToken, JWT_SECRET);
        expect(decoded.id).toBe(user._id.toString());
        const rDecoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        expect(rDecoded.id).toBe(user._id.toString());
    });

    it('uses default expiry when options omitted', () => {
        const user = { _id: new mongoose.Types.ObjectId() };
        const { accessToken, refreshToken } = generateTokens(user);
        expect(jwt.verify(accessToken, JWT_SECRET)).toBeDefined();
        expect(jwt.verify(refreshToken, JWT_REFRESH_SECRET)).toBeDefined();
    });
});

// ── register — mobile platform paths ─────────────────────────────────────────

describe('authService.register — mobile platform', () => {
    it('throws when phone already exists in User collection (mobile)', async () => {
        const existing = await makeUser({ phone: '5550000001' });
        await expect(
            authService.register({
                name: 'New',
                email: `new-${Date.now()}@example.com`,
                phone: '5550000001',
                password: VALID_PASSWORD,
                platform: 'mobile',
            })
        ).rejects.toMatchObject({ status: 400, message: 'Phone already exists with another user' });
    });

    it('throws when deleted account tries to re-register (sends recovery email)', async () => {
        const email = `deleted-re-${Date.now()}@example.com`;
        await makeUser({ email, isDeleted: true, deletedAt: new Date(), recoveryCode: null });
        await expect(
            authService.register({
                name: 'Re-reg',
                email,
                phone: String(Date.now()),
                password: VALID_PASSWORD,
            })
        ).rejects.toMatchObject({ status: 403, existingUser: true });
    });

    it('creates user on mobile platform', async () => {
        const result = await authService.register({
            name: 'Mobile User',
            email: `mob-${Date.now()}@example.com`,
            phone: String(Date.now()),
            password: VALID_PASSWORD,
            platform: 'mobile',
        });
        expect(result.user).toBeDefined();
        expect(result.user.platform).toBe('Mobile app');
    });
});

// ── loginWithCredentials — more edge cases ────────────────────────────────────

describe('authService.loginWithCredentials — edge cases', () => {
    it('throws 403 when account is deleted (admin)', async () => {
        const user = await makeUser({
            email: `del-admin-${Date.now()}@ex.com`,
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: 'admin',
        });
        await expect(
            authService.loginWithCredentials({ email: user.email, password: VALID_PASSWORD })
        ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('administrator') });
    });

    it('throws 403 when account is deleted (self)', async () => {
        const user = await makeUser({
            email: `del-self-${Date.now()}@ex.com`,
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: 'user',
        });
        await expect(
            authService.loginWithCredentials({ email: user.email, password: VALID_PASSWORD })
        ).rejects.toMatchObject({ status: 403 });
    });

    it('throws 403 when account is blocked', async () => {
        const user = await makeUser({ email: `blocked-${Date.now()}@ex.com`, isBlocked: true });
        await expect(
            authService.loginWithCredentials({ email: user.email, password: VALID_PASSWORD })
        ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('blocked') });
    });

    it('throws on mobile when account was created with Google', async () => {
        const hashed = await bcrypt.hash(VALID_PASSWORD, 10);
        const user = await makeUser({
            email: `google-mob-${Date.now()}@ex.com`,
            authProvider: 'google',
            password: undefined,
        });
        // Remove password to simulate social-only account
        await User.updateOne({ _id: user._id }, { $unset: { password: 1 } });
        const fresh = await User.findById(user._id);
        await expect(
            authService.loginWithCredentials({ email: fresh.email, password: VALID_PASSWORD, platform: 'mobile' })
        ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Google') });
    });

    it('returns mobile tokens with session when platform=mobile', async () => {
        const user = await makeUser({ email: `mob-login-${Date.now()}@ex.com` });
        const result = await authService.loginWithCredentials({
            email: user.email,
            password: VALID_PASSWORD,
            platform: 'mobile',
            deviceInfo: { deviceId: 'test-dev', userAgent: 'TestUA', ip: '1.1.1.1', fcmToken: 'fcm' },
            fcmToken: 'fcm-direct',
        });
        expect(result.tokens.accessToken).toBeDefined();
        expect(result.tokens.refreshToken).toBeDefined();
        const updated = await User.findById(user._id);
        expect(updated.sessions.length).toBeGreaterThan(0);
    });

    it('returns web tokens with rememberMe=true (30d cookie)', async () => {
        const user = await makeUser({ email: `web-rem-${Date.now()}@ex.com` });
        const result = await authService.loginWithCredentials({
            email: user.email,
            password: VALID_PASSWORD,
            platform: 'web',
            rememberMe: true,
        });
        expect(result.cookieMaxAge).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('saves fcmToken when provided on web platform', async () => {
        const user = await makeUser({ email: `web-fcm-${Date.now()}@ex.com` });
        await authService.loginWithCredentials({
            email: user.email,
            password: VALID_PASSWORD,
            platform: 'web',
            fcmToken: 'web-fcm-token',
        });
        const updated = await User.findById(user._id);
        expect(updated.fcmToken).toBe('web-fcm-token');
    });
});

// ── googleLogin ───────────────────────────────────────────────────────────────

describe('authService.googleLogin', () => {
    beforeEach(() => {
        mockGoogleVerifyFn.mockReset();
        mockAxiosGetFn.mockReset();
    });

    it('throws 400 when neither tokenId nor accessToken provided', async () => {
        await expect(
            authService.googleLogin({ platform: 'mobile' })
        ).rejects.toMatchObject({ status: 400, message: 'Either tokenId or accessToken is required' });
    });

    it('throws 400 when tokenId format is invalid (not 3 parts)', async () => {
        await expect(
            authService.googleLogin({ tokenId: 'bad-token', platform: 'web' })
        ).rejects.toMatchObject({ status: 400, message: 'Invalid tokenId format' });
    });

    it('throws 401 when tokenId verification fails', async () => {
        mockGoogleVerifyFn.mockRejectedValue(new Error('invalid token'));
        await expect(
            authService.googleLogin({ tokenId: 'a.b.c', platform: 'web' })
        ).rejects.toMatchObject({ status: 401, message: 'Invalid or expired Google token' });
    });

    it('throws 401 when accessToken request fails', async () => {
        mockAxiosGetFn.mockRejectedValue(new Error('network error'));
        await expect(
            authService.googleLogin({ accessToken: 'bad-access-token', platform: 'mobile' })
        ).rejects.toMatchObject({ status: 401, message: 'Invalid or expired Google access token' });
    });

    it('throws 400 when Google returns no email', async () => {
        const mockTicket = { getPayload: () => ({ email: null, given_name: 'A', family_name: 'B', picture: null }) };
        mockGoogleVerifyFn.mockResolvedValue(mockTicket);
        await expect(
            authService.googleLogin({ tokenId: 'a.b.c', platform: 'web' })
        ).rejects.toMatchObject({ status: 400, message: 'Email not provided by Google' });
    });

    it('creates new user via tokenId (web platform)', async () => {
        const email = `google-new-${Date.now()}@example.com`;
        const mockTicket = { getPayload: () => ({ email, given_name: 'Google', family_name: 'User', picture: 'http://pic.jpg' }) };
        mockGoogleVerifyFn.mockResolvedValue(mockTicket);

        const result = await authService.googleLogin({ tokenId: 'a.b.c', platform: 'web' });
        expect(result.isNewUser).toBe(true);
        expect(result.user.email).toBe(email);
        expect(result.tokens.accessToken).toBeDefined();
    });

    it('returns existing user via tokenId (web platform)', async () => {
        const existingUser = await makeUser({ email: `google-exist-${Date.now()}@example.com`, authProvider: 'google' });
        const mockTicket = { getPayload: () => ({ email: existingUser.email, given_name: 'G', family_name: 'U', picture: null }) };
        mockGoogleVerifyFn.mockResolvedValue(mockTicket);

        const result = await authService.googleLogin({ tokenId: 'a.b.c', platform: 'web', rememberMe: true });
        expect(result.isNewUser).toBe(false);
        expect(result.cookieMaxAge).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('creates new user via accessToken (mobile platform)', async () => {
        const email = `google-mob-new-${Date.now()}@example.com`;
        mockAxiosGetFn.mockResolvedValue({
            data: { email, given_name: 'Mob', family_name: 'Google', picture: null },
        });

        const result = await authService.googleLogin({
            accessToken: 'ya29.xxx',
            platform: 'mobile',
            deviceInfo: { deviceId: 'mob-dev', userAgent: 'android', ip: '1.1.1.1', fcmToken: 'tok' },
        });
        expect(result.isNewUser).toBe(true);
        expect(result.tokens.refreshToken).toBeDefined();
    });

    it('returns existing user via accessToken (mobile platform)', async () => {
        const existingUser = await makeUser({ email: `google-mob-exist-${Date.now()}@example.com`, authProvider: 'google' });
        mockAxiosGetFn.mockResolvedValue({
            data: { email: existingUser.email, given_name: 'E', family_name: 'X', picture: null },
        });

        const result = await authService.googleLogin({
            accessToken: 'ya29.yyy',
            platform: 'mobile',
            deviceInfo: { deviceId: 'mob-dev-2', userAgent: 'ios', ip: null, fcmToken: null },
        });
        expect(result.isNewUser).toBe(false);
    });

    it('throws 403 when account deleted by admin', async () => {
        const user = await makeUser({
            email: `google-del-admin-${Date.now()}@example.com`,
            authProvider: 'google',
            isDeleted: true,
            deletedBy: 'admin',
        });
        const mockTicket = { getPayload: () => ({ email: user.email, given_name: 'G', family_name: 'U', picture: null }) };
        mockGoogleVerifyFn.mockResolvedValue(mockTicket);

        await expect(
            authService.googleLogin({ tokenId: 'a.b.c', platform: 'web' })
        ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('administrator') });
    });

    it('throws 403 when account deleted by user (web)', async () => {
        const user = await makeUser({
            email: `google-del-user-${Date.now()}@example.com`,
            authProvider: 'google',
            isDeleted: true,
            deletedBy: 'user',
        });
        const mockTicket = { getPayload: () => ({ email: user.email, given_name: 'G', family_name: 'U', picture: null }) };
        mockGoogleVerifyFn.mockResolvedValue(mockTicket);

        await expect(
            authService.googleLogin({ tokenId: 'a.b.c', platform: 'web' })
        ).rejects.toMatchObject({ status: 403 });
    });

    it('throws 403 when account is blocked', async () => {
        const user = await makeUser({
            email: `google-blocked-${Date.now()}@example.com`,
            authProvider: 'google',
            isBlocked: true,
        });
        const mockTicket = { getPayload: () => ({ email: user.email, given_name: 'G', family_name: 'U', picture: null }) };
        mockGoogleVerifyFn.mockResolvedValue(mockTicket);

        await expect(
            authService.googleLogin({ tokenId: 'a.b.c', platform: 'web' })
        ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('blocked') });
    });

    it('uses ANDROID_GOOGLE_CLIENT_ID when userAgent=android (mobile)', async () => {
        const email = `google-android-${Date.now()}@example.com`;
        mockAxiosGetFn.mockResolvedValue({ data: { email, given_name: 'A', family_name: 'B', picture: null } });

        const result = await authService.googleLogin({
            accessToken: 'token',
            platform: 'mobile',
            userAgent: 'android',
        });
        expect(result.user.email).toBe(email);
    });

    it('uses IOS_GOOGLE_CLIENT_ID when userAgent=ios (mobile)', async () => {
        const email = `google-ios-${Date.now()}@example.com`;
        mockAxiosGetFn.mockResolvedValue({ data: { email, given_name: 'I', family_name: 'O', picture: null } });

        const result = await authService.googleLogin({
            accessToken: 'token',
            platform: 'mobile',
            userAgent: 'ios',
        });
        expect(result.user.email).toBe(email);
    });
});

// ── appleLogin — mobile ───────────────────────────────────────────────────────

describe('authService.appleLogin — mobile', () => {
    beforeEach(() => {
        mockAppleVerifyFn.mockReset();
    });

    it('throws 400 when idToken missing (mobile)', async () => {
        await expect(
            authService.appleLogin({ platform: 'mobile' })
        ).rejects.toMatchObject({ status: 400, message: 'Missing Apple identity token' });
    });

    it('creates new user on first Apple mobile login', async () => {
        const sub = `apple-sub-${Date.now()}`;
        const email = `apple-new-mob-${Date.now()}@privaterelay.appleid.com`;
        mockAppleVerifyFn.mockResolvedValue({ email, sub });

        const result = await authService.appleLogin({
            idToken: 'apple.id.token',
            name: 'Apple User',
            platform: 'mobile',
            deviceInfo: { deviceId: 'apple-dev', userAgent: 'ios', ip: null, fcmToken: null },
        });
        expect(result.isNewUser).toBe(true);
        expect(result.user.provider).toBe('apple');
    });

    it('returns existing Apple user (mobile)', async () => {
        const sub = `apple-exist-sub-${Date.now()}`;
        const email = `apple-exist-mob-${Date.now()}@privaterelay.appleid.com`;
        await User.create({
            name: 'Apple Existing',
            email,
            appleId: sub,
            authProvider: 'apple',
            platform: 'Mobile app',
        });
        mockAppleVerifyFn.mockResolvedValue({ email, sub });

        const result = await authService.appleLogin({
            idToken: 'apple.id.token',
            platform: 'mobile',
            deviceInfo: { deviceId: 'apple-dev-2', userAgent: null, ip: null, fcmToken: null },
        });
        expect(result.isNewUser).toBe(false);
    });

    it('throws 403 when mobile Apple account deleted by admin', async () => {
        const sub = `apple-del-admin-${Date.now()}`;
        const email = `apple-del-admin-${Date.now()}@example.com`;
        await User.create({
            name: 'Apple Del',
            email,
            appleId: sub,
            authProvider: 'apple',
            isDeleted: true,
            deletedBy: 'admin',
            platform: 'Mobile app',
        });
        mockAppleVerifyFn.mockResolvedValue({ email, sub });

        await expect(
            authService.appleLogin({ idToken: 'token', platform: 'mobile' })
        ).rejects.toMatchObject({ status: 403 });
    });

    it('throws 403 when mobile Apple account is blocked', async () => {
        const sub = `apple-blocked-${Date.now()}`;
        const email = `apple-blocked-${Date.now()}@example.com`;
        await User.create({
            name: 'Apple Blocked',
            email,
            appleId: sub,
            authProvider: 'apple',
            isBlocked: true,
            platform: 'Mobile app',
        });
        mockAppleVerifyFn.mockResolvedValue({ email, sub });

        await expect(
            authService.appleLogin({ idToken: 'token', platform: 'mobile' })
        ).rejects.toMatchObject({ status: 403 });
    });
});

// ── appleLogin — web ──────────────────────────────────────────────────────────

describe('authService.appleLogin — web', () => {
    it('throws 400 when no idToken and no authorizationCode', async () => {
        await expect(
            authService.appleLogin({ platform: 'web' })
        ).rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 with _needsCodeExchange when only authCode provided', async () => {
        await expect(
            authService.appleLogin({ authorizationCode: 'auth-code-abc', platform: 'web' })
        ).rejects.toMatchObject({ status: 400, _needsCodeExchange: true, authCode: 'auth-code-abc' });
    });

    it('creates new user from identityToken (web platform)', async () => {
        const sub = `apple-web-new-${Date.now()}`;
        const email = `apple-web-new-${Date.now()}@example.com`;

        // Build a minimal JWT with apple-like payload
        const identityToken = jwt.sign(
            { sub, email, iss: 'https://appleid.apple.com', aud: process.env.APPLE_WEB_CLIENT_ID },
            'any-key',
            { algorithm: 'HS256' }
        );

        const result = await authService.appleLogin({
            idToken: identityToken,
            firstName: 'Web',
            lastName: 'Apple',
            platform: 'web',
        });
        expect(result.isNewUser).toBe(true);
        expect(result.user.email).toBe(email);
    });

    it('updates existing user from identityToken (web platform)', async () => {
        const sub = `apple-web-exist-${Date.now()}`;
        const email = `apple-web-exist-${Date.now()}@example.com`;
        await User.create({
            name: 'Apple Web Existing',
            email,
            appleId: sub,
            authProvider: 'apple',
            platform: 'Website',
        });

        const identityToken = jwt.sign(
            { sub, email, iss: 'https://appleid.apple.com', aud: process.env.APPLE_WEB_CLIENT_ID },
            'any-key',
            { algorithm: 'HS256' }
        );

        const result = await authService.appleLogin({
            idToken: identityToken,
            platform: 'web',
            rememberMe: true,
        });
        expect(result.isNewUser).toBe(false);
        expect(result.cookieMaxAge).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('throws 401 when issuer is wrong (web)', async () => {
        const identityToken = jwt.sign(
            { sub: 'sub123', email: 'x@y.com', iss: 'https://evil.com', aud: process.env.APPLE_WEB_CLIENT_ID },
            'any-key',
            { algorithm: 'HS256' }
        );
        await expect(
            authService.appleLogin({ idToken: identityToken, platform: 'web' })
        ).rejects.toMatchObject({ status: 401, message: 'Invalid token issuer' });
    });

    it('throws 401 when audience is wrong (web)', async () => {
        const identityToken = jwt.sign(
            { sub: 'sub456', email: 'x@y.com', iss: 'https://appleid.apple.com', aud: 'wrong.audience' },
            'any-key',
            { algorithm: 'HS256' }
        );
        await expect(
            authService.appleLogin({ idToken: identityToken, platform: 'web' })
        ).rejects.toMatchObject({ status: 401, message: 'Invalid token audience' });
    });

    it('throws 403 when web apple account deleted', async () => {
        const sub = `apple-web-del-${Date.now()}`;
        const email = `apple-web-del-${Date.now()}@example.com`;
        await User.create({
            name: 'Apple Web Del',
            email,
            appleId: sub,
            authProvider: 'apple',
            isDeleted: true,
            deletedBy: 'user',
            platform: 'Website',
        });
        const identityToken = jwt.sign(
            { sub, email, iss: 'https://appleid.apple.com', aud: process.env.APPLE_WEB_CLIENT_ID },
            'any-key',
            { algorithm: 'HS256' }
        );
        await expect(
            authService.appleLogin({ idToken: identityToken, platform: 'web' })
        ).rejects.toMatchObject({ status: 403 });
    });

    it('creates user without email (email in payload null)', async () => {
        const sub = `apple-web-noemail-${Date.now()}`;

        const identityToken = jwt.sign(
            { sub, email: null, iss: 'https://appleid.apple.com', aud: process.env.APPLE_WEB_CLIENT_ID },
            'any-key',
            { algorithm: 'HS256' }
        );

        // User found via appleId lookup (created first)
        const email = `apple-web-noemail-${Date.now()}@example.com`;
        await User.create({
            name: 'Apple No Email',
            email,
            appleId: sub,
            authProvider: 'apple',
            platform: 'Website',
        });

        const result = await authService.appleLogin({ idToken: identityToken, platform: 'web' });
        expect(result.isNewUser).toBe(false);
    });

    it('parses userData string for name/email', async () => {
        const sub = `apple-ud-${Date.now()}`;
        const email = `apple-ud-${Date.now()}@example.com`;
        const userData = JSON.stringify({ email, name: { firstName: 'John', lastName: 'Doe' } });

        const identityToken = jwt.sign(
            { sub, email: null, iss: 'https://appleid.apple.com', aud: process.env.APPLE_WEB_CLIENT_ID },
            'any-key',
            { algorithm: 'HS256' }
        );

        const result = await authService.appleLogin({
            idToken: identityToken,
            userData,
            platform: 'web',
        });
        expect(result.user.name).toBe('John Doe');
    });
});

// ── forgotPassword — edge cases ───────────────────────────────────────────────

describe('authService.forgotPassword — edge cases', () => {
    it('throws 403 when user is deleted', async () => {
        const user = await makeUser({ isDeleted: true, deletedAt: new Date() });
        await expect(
            authService.forgotPassword(user.email)
        ).rejects.toMatchObject({ status: 403 });
    });

    it('throws 400 when user has social login provider', async () => {
        const user = await makeUser({ authProvider: 'google' });
        await User.updateOne({ _id: user._id }, { $set: { authProvider: 'google' } });
        await expect(
            authService.forgotPassword(user.email)
        ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('social login') });
    });
});

// ── verifyCode — expired token ────────────────────────────────────────────────

describe('authService.verifyCode — expired', () => {
    it('throws 400 when resetPasswordExpires is in the past', async () => {
        const code = '123456';
        const token = jwt.sign({ code }, JWT_SECRET, { expiresIn: '1h' });
        const user = await makeUser({
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() - 1000, // expired 1 second ago
        });
        await expect(
            authService.verifyCode(user.email, code)
        ).rejects.toMatchObject({ status: 400, message: 'Code expired or invalid' });
    });

    it('throws 404 when user not found', async () => {
        await expect(
            authService.verifyCode('notfound@example.com', '000000')
        ).rejects.toMatchObject({ status: 404 });
    });
});

// ── resetPassword — edge cases ────────────────────────────────────────────────

describe('authService.resetPassword — edge cases', () => {
    it('throws 400 when fields missing', async () => {
        await expect(
            authService.resetPassword('', '123', 'Pass@1234')
        ).rejects.toMatchObject({ status: 400, message: 'All fields are required' });
    });

    it('throws 400 when password is weak', async () => {
        const code = '111222';
        const token = jwt.sign({ code }, JWT_SECRET, { expiresIn: '10m' });
        const user = await makeUser({
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });
        await expect(
            authService.resetPassword(user.email, code, 'weak')
        ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Password must be') });
    });

    it('throws 400 when token expired', async () => {
        const code = '333444';
        const token = jwt.sign({ code }, JWT_SECRET, { expiresIn: '1h' });
        const user = await makeUser({
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() - 1000,
        });
        await expect(
            authService.resetPassword(user.email, code, VALID_PASSWORD)
        ).rejects.toMatchObject({ status: 400, message: 'Code expired or invalid' });
    });

    it('throws 400 when code is wrong', async () => {
        const code = '555666';
        const token = jwt.sign({ code }, JWT_SECRET, { expiresIn: '10m' });
        const user = await makeUser({
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });
        await expect(
            authService.resetPassword(user.email, '000000', VALID_PASSWORD)
        ).rejects.toMatchObject({ status: 400, message: 'Invalid code' });
    });

    it('creates notification on web platform', async () => {
        const code = '777888';
        const token = jwt.sign({ code }, JWT_SECRET, { expiresIn: '10m' });
        const user = await makeUser({
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });
        const Notification = require('../../src/models/Notification');
        const before = await Notification.countDocuments({ email: user.email });
        await authService.resetPassword(user.email, code, VALID_PASSWORD, 'web');
        const after = await Notification.countDocuments({ email: user.email });
        expect(after).toBe(before + 1);
    });

    it('does not create notification on mobile platform', async () => {
        const code = '999000';
        const token = jwt.sign({ code }, JWT_SECRET, { expiresIn: '10m' });
        const user = await makeUser({
            resetPasswordToken: token,
            resetPasswordExpires: Date.now() + 10 * 60 * 1000,
        });
        const Notification = require('../../src/models/Notification');
        const before = await Notification.countDocuments({ email: user.email });
        await authService.resetPassword(user.email, code, VALID_PASSWORD, 'mobile');
        const after = await Notification.countDocuments({ email: user.email });
        expect(after).toBe(before); // no notification
    });
});

// ── updatePassword — edge cases ───────────────────────────────────────────────

describe('authService.updatePassword — edge cases', () => {
    it('throws 404 when user not found', async () => {
        await expect(
            authService.updatePassword(new mongoose.Types.ObjectId(), VALID_PASSWORD, 'New@1234')
        ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when password is weak', async () => {
        const user = await makeUser();
        await expect(
            authService.updatePassword(user._id, VALID_PASSWORD, 'weak')
        ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Password must be') });
    });

    it('throws 400 when new password same as old', async () => {
        const user = await makeUser();
        await expect(
            authService.updatePassword(user._id, VALID_PASSWORD, VALID_PASSWORD)
        ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('different') });
    });

    it('throws 400 when user has no password (social account)', async () => {
        const user = await User.create({
            name: 'Social',
            email: `social-upd-${Date.now()}@ex.com`,
            authProvider: 'google',
        });
        await expect(
            authService.updatePassword(user._id, VALID_PASSWORD, 'New@1234')
        ).rejects.toMatchObject({ status: 400, message: 'Invalid password format' });
    });
});

// ── refreshToken ──────────────────────────────────────────────────────────────

describe('authService.refreshToken', () => {
    it('throws 401 when no token provided', async () => {
        await expect(authService.refreshToken(null)).rejects.toMatchObject({ status: 401 });
    });

    it('throws 403 when token is invalid/expired', async () => {
        await expect(authService.refreshToken('bad.token.value')).rejects.toMatchObject({ status: 403 });
    });

    it('throws 403 when user not found', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const token = jwt.sign({ id: fakeId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
        await expect(authService.refreshToken(token)).rejects.toMatchObject({ status: 403 });
    });

    it('throws 403 when session not found or revoked', async () => {
        const user = await makeUser();
        const token = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
        // No sessions exist
        await expect(authService.refreshToken(token)).rejects.toMatchObject({ status: 403, message: 'Invalid refresh token' });
    });

    it('issues new tokens when session is valid', async () => {
        const user = await makeUser();
        const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
        user.sessions = [{
            deviceId: 'dev-rt',
            refreshToken,
            revokedAt: null,
            lastUsed: new Date(),
            createdAt: new Date(),
        }];
        await user.save();

        const result = await authService.refreshToken(refreshToken);
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
    });
});

// ── checkAccessToken ──────────────────────────────────────────────────────────

describe('authService.checkAccessToken', () => {
    it('throws 401 when accessToken missing', async () => {
        await expect(authService.checkAccessToken(null, null)).rejects.toMatchObject({ status: 401, message: 'Access token missing' });
    });

    it('returns valid=true for fresh access token', async () => {
        const accessToken = jwt.sign({ id: 'user123' }, JWT_SECRET, { expiresIn: '1h' });
        const result = await authService.checkAccessToken(accessToken, null);
        expect(result.valid).toBe(true);
        expect(result.userId).toBe('user123');
    });

    it('throws 401 when access token completely invalid', async () => {
        await expect(
            authService.checkAccessToken('garbage.token.here', null)
        ).rejects.toMatchObject({ status: 401, message: 'Invalid access token' });
    });

    it('throws 401 when access token expired and no refresh token', async () => {
        const accessToken = jwt.sign({ id: 'user123' }, JWT_SECRET, { expiresIn: '-1s' });
        await expect(
            authService.checkAccessToken(accessToken, null)
        ).rejects.toMatchObject({ status: 401, message: expect.stringContaining('Refresh token missing') });
    });

    it('throws 403 when refresh token invalid on expired access token', async () => {
        const accessToken = jwt.sign({ id: 'user123' }, JWT_SECRET, { expiresIn: '-1s' });
        await expect(
            authService.checkAccessToken(accessToken, 'bad.refresh.token')
        ).rejects.toMatchObject({ status: 403 });
    });

    it('issues new tokens when access expired but refresh valid', async () => {
        const user = await makeUser();
        const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
        user.sessions = [{ deviceId: 'dev-cat', refreshToken, revokedAt: null, lastUsed: new Date(), createdAt: new Date() }];
        await user.save();

        const expiredAccess = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '-1s' });
        const result = await authService.checkAccessToken(expiredAccess, refreshToken);
        expect(result.valid).toBe(false);
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
    });

    it('throws 403 when refresh session not found during checkAccessToken', async () => {
        const user = await makeUser();
        const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
        // No sessions
        const expiredAccess = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '-1s' });
        await expect(
            authService.checkAccessToken(expiredAccess, refreshToken)
        ).rejects.toMatchObject({ status: 403 });
    });
});

// ── deleteAccount ─────────────────────────────────────────────────────────────

describe('authService.deleteAccount', () => {
    it('throws 404 when user not found', async () => {
        await expect(
            authService.deleteAccount(new mongoose.Types.ObjectId())
        ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when already deleted', async () => {
        const user = await makeUser({ isDeleted: true, deletedAt: new Date() });
        await expect(
            authService.deleteAccount(user._id)
        ).rejects.toMatchObject({ status: 400, message: 'Account already deleted' });
    });

    it('deletes on mobile platform without setting deletedBy', async () => {
        const user = await makeUser();
        await authService.deleteAccount(user._id, 'mobile');
        const updated = await User.findById(user._id);
        expect(updated.isDeleted).toBe(true);
        expect(updated.deletedBy).toBeFalsy();
    });
});

// ── deleteAccountPublic ───────────────────────────────────────────────────────

describe('authService.deleteAccountPublic', () => {
    it('throws 400 when fields missing', async () => {
        await expect(authService.deleteAccountPublic('', 'pass')).rejects.toMatchObject({ status: 400 });
    });

    it('throws 404 when user not found', async () => {
        await expect(authService.deleteAccountPublic('nobody@ex.com', 'pass')).rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when account already deleted', async () => {
        const user = await makeUser({ isDeleted: true, deletedAt: new Date() });
        await expect(authService.deleteAccountPublic(user.email, VALID_PASSWORD)).rejects.toMatchObject({ status: 400 });
    });

    it('throws 403 when account is blocked', async () => {
        const user = await makeUser({ isBlocked: true });
        await expect(authService.deleteAccountPublic(user.email, VALID_PASSWORD)).rejects.toMatchObject({ status: 403 });
    });

    it('throws 400 when no password (social account)', async () => {
        const user = await User.create({
            name: 'Social Del',
            email: `social-del-pub-${Date.now()}@ex.com`,
            authProvider: 'google',
        });
        await expect(authService.deleteAccountPublic(user.email, 'anypassword')).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining('social login'),
        });
    });

    it('throws 400 on wrong password', async () => {
        const user = await makeUser();
        await expect(authService.deleteAccountPublic(user.email, 'Wrong@9999')).rejects.toMatchObject({ status: 400 });
    });

    it('soft-deletes account on correct password', async () => {
        const user = await makeUser();
        await authService.deleteAccountPublic(user.email, VALID_PASSWORD);
        const updated = await User.findById(user._id);
        expect(updated.isDeleted).toBe(true);
        expect(updated.deletedBy).toBe('user');
    });
});

// ── verifyRecoveryCode ────────────────────────────────────────────────────────

describe('authService.verifyRecoveryCode — edge cases', () => {
    it('throws 400 when fields missing', async () => {
        await expect(authService.verifyRecoveryCode('', '123', VALID_PASSWORD))
            .rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when no deleted account found', async () => {
        const user = await makeUser({ isDeleted: false });
        await expect(authService.verifyRecoveryCode(user.email, '123456', VALID_PASSWORD))
            .rejects.toMatchObject({ status: 400, message: expect.stringContaining('No deleted account') });
    });

    it('throws 400 when recovery code expired', async () => {
        const user = await makeUser({
            isDeleted: true,
            recoveryCode: '111111',
            recoveryCodeExpires: Date.now() - 1000,
        });
        await expect(authService.verifyRecoveryCode(user.email, '111111', VALID_PASSWORD))
            .rejects.toMatchObject({ status: 400, message: expect.stringContaining('expired') });
    });

    it('throws 400 when new password is weak', async () => {
        const user = await makeUser({
            isDeleted: true,
            recoveryCode: '222222',
            recoveryCodeExpires: Date.now() + 15 * 60 * 1000,
        });
        await expect(authService.verifyRecoveryCode(user.email, '222222', 'weak'))
            .rejects.toMatchObject({ status: 400, message: expect.stringContaining('Password must be') });
    });

    it('clears deletedBy on web platform restore', async () => {
        const user = await makeUser({
            isDeleted: true,
            deletedBy: 'user',
            recoveryCode: '333333',
            recoveryCodeExpires: Date.now() + 15 * 60 * 1000,
        });
        await authService.verifyRecoveryCode(user.email, '333333', VALID_PASSWORD, 'web');
        const updated = await User.findById(user._id);
        expect(updated.isDeleted).toBe(false);
        expect(updated.deletedBy).toBeNull();
    });

    it('does not clear deletedBy on mobile platform restore', async () => {
        const user = await makeUser({
            isDeleted: true,
            deletedBy: 'user',
            recoveryCode: '444444',
            recoveryCodeExpires: Date.now() + 15 * 60 * 1000,
        });
        await authService.verifyRecoveryCode(user.email, '444444', VALID_PASSWORD, 'mobile');
        const updated = await User.findById(user._id);
        expect(updated.isDeleted).toBe(false);
        // deletedBy not cleared on mobile
        expect(updated.deletedBy).toBeTruthy();
    });
});

// ── resendRecoveryCode ────────────────────────────────────────────────────────

describe('authService.resendRecoveryCode', () => {
    it('throws 400 when email missing', async () => {
        await expect(authService.resendRecoveryCode('')).rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when no deleted account found', async () => {
        const user = await makeUser({ isDeleted: false });
        await expect(authService.resendRecoveryCode(user.email)).rejects.toMatchObject({ status: 400 });
    });

    it('throws 429 when 5 attempts already used', async () => {
        const user = await makeUser({
            isDeleted: true,
            recoveryAttempts: 5,
            lastRecoveryRequest: new Date(),
        });
        await expect(authService.resendRecoveryCode(user.email)).rejects.toMatchObject({
            status: 429,
            attemptsLeft: 0,
        });
    });

    it('resets attempts counter after 24h and allows resend', async () => {
        const user = await makeUser({
            isDeleted: true,
            recoveryAttempts: 5,
            lastRecoveryRequest: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago
        });
        const result = await authService.resendRecoveryCode(user.email);
        expect(result.attemptsUsed).toBe(1);
        expect(result.attemptsLeft).toBe(4);
    });

    it('sends code and returns attemptsLeft', async () => {
        const user = await makeUser({
            isDeleted: true,
            recoveryAttempts: 2,
            lastRecoveryRequest: new Date(),
        });
        const result = await authService.resendRecoveryCode(user.email);
        expect(result.attemptsUsed).toBe(3);
        expect(result.attemptsLeft).toBe(2);
    });
});

// ── updateProfile — edge cases ────────────────────────────────────────────────

describe('authService.updateProfile — edge cases', () => {
    it('throws 400 when email missing', async () => {
        const user = await makeUser();
        await expect(
            authService.updateProfile(user._id, { name: 'Name', phone: '123' })
        ).rejects.toMatchObject({ status: 400, message: 'Email is required' });
    });

    it('throws 400 when phone missing', async () => {
        const user = await makeUser();
        await expect(
            authService.updateProfile(user._id, { name: 'Name', email: user.email })
        ).rejects.toMatchObject({ status: 400, message: 'Phone is required' });
    });

    it('throws 400 when phone already in use by another user', async () => {
        const other = await makeUser({ phone: '8880000001' });
        const user = await makeUser({ phone: '8880000002' });
        await expect(
            authService.updateProfile(user._id, { name: 'Test', email: user.email, phone: '8880000001' })
        ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Phone already exists') });
    });

    it('updates username when provided', async () => {
        const user = await makeUser();
        const result = await authService.updateProfile(user._id, {
            name: 'Name',
            email: user.email,
            phone: user.phone,
            username: 'cool_username',
        });
        expect(result.user.username).toBe('cool_username');
    });

    it('updates avatar when provided', async () => {
        const user = await makeUser();
        const result = await authService.updateProfile(user._id, {
            name: 'Name',
            email: user.email,
            phone: user.phone,
        }, 'https://cdn.example.com/avatar.jpg');
        expect(result.user.avatar).toBe('https://cdn.example.com/avatar.jpg');
    });
});

// ── getUserData — edge cases ──────────────────────────────────────────────────

describe('authService.getUserData — edge cases', () => {
    it('throws 403 when user is deleted (admin)', async () => {
        const user = await makeUser({ isDeleted: true, deletedBy: 'admin' });
        await expect(authService.getUserData(user._id)).rejects.toMatchObject({
            status: 403,
            message: expect.stringContaining('administrator'),
        });
    });

    it('throws 403 when user is deleted (self)', async () => {
        const user = await makeUser({ isDeleted: true, deletedBy: 'user' });
        await expect(authService.getUserData(user._id)).rejects.toMatchObject({ status: 403 });
    });

    it('throws 403 when user is blocked', async () => {
        const user = await makeUser({ isBlocked: true });
        await expect(authService.getUserData(user._id)).rejects.toMatchObject({
            status: 403,
            message: expect.stringContaining('blocked'),
        });
    });
});
