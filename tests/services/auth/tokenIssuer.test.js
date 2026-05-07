'use strict';

/**
 * tokenIssuer.test.js — pure unit tests for domain/tokenIssuer.js
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';

const jwt = require('jsonwebtoken');
const tokenIssuer = require('../../../src/services/auth/domain/tokenIssuer');

const FAKE_USER = { _id: 'user-id-abc' };

describe('tokenIssuer.generateTokens', () => {
    it('returns accessToken and refreshToken strings', () => {
        const { accessToken, refreshToken } = tokenIssuer.generateTokens(FAKE_USER);
        expect(typeof accessToken).toBe('string');
        expect(typeof refreshToken).toBe('string');
    });

    it('accessToken decodes to correct user id', () => {
        const { accessToken } = tokenIssuer.generateTokens(FAKE_USER);
        const decoded = jwt.decode(accessToken);
        expect(decoded.id).toBe('user-id-abc');
    });

    it('uses custom expiry options', () => {
        const { accessToken } = tokenIssuer.generateTokens(FAKE_USER, { accessExpiry: '2m' });
        const decoded = jwt.decode(accessToken);
        // exp - iat should be ~120 seconds
        expect(decoded.exp - decoded.iat).toBeCloseTo(120, -1);
    });

    it('accessToken defaults to 1h expiry', () => {
        const { accessToken } = tokenIssuer.generateTokens(FAKE_USER);
        const decoded = jwt.decode(accessToken);
        expect(decoded.exp - decoded.iat).toBeCloseTo(3600, -1);
    });

    it('refreshToken defaults to 7d expiry', () => {
        const { refreshToken } = tokenIssuer.generateTokens(FAKE_USER);
        const decoded = jwt.decode(refreshToken);
        expect(decoded.exp - decoded.iat).toBeCloseTo(7 * 24 * 3600, -1);
    });
});

describe('tokenIssuer.verifyAccessToken', () => {
    it('decodes a valid access token', () => {
        const { accessToken } = tokenIssuer.generateTokens(FAKE_USER);
        const decoded = tokenIssuer.verifyAccessToken(accessToken);
        expect(decoded.id).toBe('user-id-abc');
    });

    it('throws on invalid token', () => {
        expect(() => tokenIssuer.verifyAccessToken('bad.token.here')).toThrow();
    });
});

describe('tokenIssuer.verifyRefreshToken', () => {
    it('decodes a valid refresh token', () => {
        const { refreshToken } = tokenIssuer.generateTokens(FAKE_USER);
        const decoded = tokenIssuer.verifyRefreshToken(refreshToken);
        expect(decoded.id).toBe('user-id-abc');
    });

    it('throws on tampered token', () => {
        const { refreshToken } = tokenIssuer.generateTokens(FAKE_USER);
        expect(() => tokenIssuer.verifyRefreshToken(refreshToken + 'tampered')).toThrow();
    });
});

describe('tokenIssuer.signCodeToken', () => {
    it('embeds the code in the payload', () => {
        const token = tokenIssuer.signCodeToken({ code: '123456' }, '10m');
        const decoded = jwt.decode(token);
        expect(decoded.code).toBe('123456');
    });

    it('token verifies with JWT_SECRET', () => {
        const token = tokenIssuer.signCodeToken({ code: '999' });
        const decoded = tokenIssuer.verifyAccessToken(token);
        expect(decoded.code).toBe('999');
    });
});

describe('tokenIssuer.decodeToken', () => {
    it('decodes without verification', () => {
        const token = jwt.sign({ foo: 'bar' }, 'different-secret');
        const decoded = tokenIssuer.decodeToken(token);
        expect(decoded.foo).toBe('bar');
    });

    it('returns null for garbage input', () => {
        const result = tokenIssuer.decodeToken('not-a-jwt');
        expect(result).toBeNull();
    });
});
