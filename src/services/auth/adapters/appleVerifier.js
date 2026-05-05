'use strict';

/**
 * appleVerifier.js — Apple OAuth adapter.
 *
 * Implements the OAuthVerifier port for Apple identity tokens.
 * Supports both mobile (full JWT verification via apple-signin-auth)
 * and web (JWT decode-only for audience/issuer checks).
 *
 * @implements {import('../ports/oauth').OAuthVerifier}
 */

const appleSignin = require('apple-signin-auth');
const { decodeToken } = require('../domain/tokenIssuer');

/**
 * Verify an Apple identity token.
 *
 * Mobile: full cryptographic verification via apple-signin-auth.
 * Web: JWT decode + issuer/audience check (full verification is handled
 *      by the controller's code-exchange step).
 *
 * @param {string} token - Apple identity token (JWT)
 * @param {{ platform?: string, clientId?: string }} opts
 * @returns {Promise<{
 *   email: string|null,
 *   name: string,
 *   sub: string,
 *   email_verified?: boolean
 * }>}
 */
async function verifyToken(token, opts = {}) {
    const { platform = 'mobile', clientId } = opts;

    if (platform === 'mobile') {
        const audience = clientId || process.env.APPLE_CLIENT_ID;
        let appleResponse;
        try {
            appleResponse = await appleSignin.verifyIdToken(token, {
                audience,
                ignoreExpiration: true,
            });
        } catch {
            throw { status: 401, message: 'Invalid or expired Apple identity token' };
        }

        return {
            email: appleResponse.email || null,
            name: 'Apple User',
            sub: appleResponse.sub,
            email_verified: appleResponse.email_verified,
        };
    }

    // Web flow: decode without full crypto verification (controller already
    // exchanged auth code for identity token via Apple's token endpoint).
    if (!token || typeof token !== 'string') {
        throw { status: 400, message: 'Invalid identity token' };
    }

    let decoded;
    try {
        decoded = decodeToken(token, { complete: true });
        if (!decoded || !decoded.payload) {
            throw { status: 400, message: 'Invalid identity token payload' };
        }
    } catch (err) {
        if (err.status) throw err;
        throw { status: 401, message: 'Invalid or malformed Apple identity token' };
    }

    const payload = decoded.payload;

    if (payload.iss !== 'https://appleid.apple.com') {
        throw { status: 401, message: 'Invalid token issuer' };
    }

    const appleWebClientId = clientId || process.env.APPLE_WEB_CLIENT_ID || process.env.APPLE_CLIENT_ID;
    if (appleWebClientId && payload.aud !== appleWebClientId) {
        throw { status: 401, message: 'Invalid token audience' };
    }

    return {
        email: payload.email || null,
        name: 'User',
        sub: payload.sub,
        email_verified: payload.email_verified,
    };
}

module.exports = { verifyToken };
