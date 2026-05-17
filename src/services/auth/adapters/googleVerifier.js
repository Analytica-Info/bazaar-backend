'use strict';

/**
 * googleVerifier.js — Google OAuth adapter.
 *
 * Implements the OAuthVerifier port for Google identity tokens.
 * Supports both `idToken` (JWT from Google Sign-In) and `accessToken`
 * (OAuth2 bearer token for userinfo endpoint) flows.
 *
 * @implements {import('../ports/oauth').OAuthVerifier}
 */

const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

// Module-level client; GOOGLE_CLIENT_ID is read at require-time via env.
// BUG-010 carve-out: preserve module-load env constant behaviour.
const _defaultClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Resolve the audience(s) and OAuth2 client for token verification.
 *
 * For mobile platform: returns an array of all configured client IDs so that
 * google-auth-library accepts any valid aud claim regardless of User-Agent.
 * This removes brittle UA-string matching — Dart's default UA never matched
 * 'android' / 'ios' exactly, causing iOS idTokens to fail verification.
 *
 * For web platform: returns the single web client ID (unchanged behaviour).
 *
 * @param {{ platform?: string }} opts
 * @returns {{ audience: string | string[], client: OAuth2Client }}
 */
function resolveClient({ platform } = {}) {
    if (platform === 'mobile') {
        const audience = [
            process.env.GOOGLE_CLIENT_ID,
            process.env.IOS_GOOGLE_CLIENT_ID,
            process.env.ANDROID_GOOGLE_CLIENT_ID,
        ].filter(Boolean);

        return { audience, client: _defaultClient };
    }

    // Web (or unspecified) — single web client ID.
    return { audience: process.env.GOOGLE_CLIENT_ID, client: _defaultClient };
}

/**
 * Verify a Google identity token (JWT) or access token and return
 * normalised profile data matching the OAuthVerifier port shape.
 *
 * @param {string} token — either an idToken (JWT) or accessToken (bearer)
 * @param {{ isAccessToken?: boolean, platform?: string }} opts
 * @returns {Promise<{ email: string, name: string, sub: string, given_name?: string, family_name?: string, picture?: string }>}
 */
async function verifyToken(token, opts = {}) {
    const { isAccessToken = false, platform } = opts;

    if (isAccessToken) {
        try {
            const response = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = response.data;
            return {
                email: data.email,
                name: [data.given_name, data.family_name].filter(Boolean).join(' ') || 'User',
                sub: data.id || data.sub || '',
                given_name: data.given_name,
                family_name: data.family_name,
                picture: data.picture,
            };
        } catch {
            throw { status: 401, message: 'Invalid or expired Google access token' };
        }
    }

    // ID token flow
    if (typeof token !== 'string' || token.split('.').length !== 3) {
        throw { status: 400, message: 'Invalid tokenId format' };
    }

    const { audience, client } = resolveClient({ platform });

    let ticket;
    try {
        ticket = await client.verifyIdToken({ idToken: token, audience });
    } catch {
        throw { status: 401, message: 'Invalid or expired Google token' };
    }

    const payload = ticket.getPayload();
    return {
        email: payload.email,
        name: [payload.given_name, payload.family_name].filter(Boolean).join(' ') || 'User',
        sub: payload.sub,
        given_name: payload.given_name,
        family_name: payload.family_name,
        picture: payload.picture,
    };
}

module.exports = { verifyToken };
