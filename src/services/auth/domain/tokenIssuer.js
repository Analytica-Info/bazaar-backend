'use strict';

/**
 * tokenIssuer.js — pure JWT token pair generation.
 *
 * No I/O. Depends only on jwt and config constants.
 * Uses the clock seam for deterministic time in tests.
 */

const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../../../config/jwtSecret');
const JWT_REFRESH_SECRET = require('../../../config/refreshJwtSecret');

/**
 * Generate an access + refresh token pair for a user.
 *
 * @param {{ _id: string }} user
 * @param {{ accessExpiry?: string, refreshExpiry?: string }} options
 * @returns {{ accessToken: string, refreshToken: string }}
 */
function generateTokens(user, options = {}) {
    const { accessExpiry = '1h', refreshExpiry = '7d' } = options;
    const accessToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: accessExpiry });
    const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: refreshExpiry });
    return { accessToken, refreshToken };
}

/**
 * Verify an access token.
 * Throws jwt errors on invalid/expired — callers must catch.
 *
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyAccessToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

/**
 * Verify a refresh token.
 * Throws jwt errors on invalid/expired — callers must catch.
 *
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyRefreshToken(token) {
    return jwt.verify(token, JWT_REFRESH_SECRET);
}

/**
 * Sign a short-lived token containing a code (used for password-reset flows).
 *
 * @param {{ code: string }} payload
 * @param {string} expiresIn
 * @returns {string}
 */
function signCodeToken(payload, expiresIn = '10m') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Decode a JWT without verifying (used for Apple web flow).
 *
 * @param {string} token
 * @param {{ complete?: boolean }} [options]
 * @returns {object|null}
 */
function decodeToken(token, options) {
    return jwt.decode(token, options);
}

module.exports = { generateTokens, verifyAccessToken, verifyRefreshToken, signCodeToken, decodeToken };
