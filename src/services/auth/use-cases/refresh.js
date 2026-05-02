'use strict';

const clock = require('../../../utilities/clock');
const { verifyRefreshToken, generateTokens } = require('../domain/tokenIssuer');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../../../config/jwtSecret');
const JWT_REFRESH_SECRET = require('../../../config/refreshJwtSecret');
const runtimeConfig = require('../../../config/runtime');
const { User } = require('./_shared');

async function refreshToken(refreshTokenValue) {
    if (!refreshTokenValue) throw { status: 401, message: 'No token provided' };

    let payload;
    try {
        payload = verifyRefreshToken(refreshTokenValue);
    } catch {
        throw { status: 403, message: 'Invalid or expired refresh token' };
    }

    const user = await User.findById(payload.id);
    if (!user || !Array.isArray(user.sessions)) {
        throw { status: 403, message: 'User not found or sessions missing' };
    }

    const sessionIndex = user.sessions.findIndex(s => s.refreshToken === refreshTokenValue && !s.revokedAt);
    if (sessionIndex === -1) throw { status: 403, message: 'Invalid refresh token' };

    const newAccessToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: runtimeConfig.auth.accessTokenRefreshExpiry });
    const newRefreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: runtimeConfig.auth.refreshTokenExpiry });

    user.sessions[sessionIndex].refreshToken = newRefreshToken;
    user.sessions[sessionIndex].lastUsed = clock.now();
    await user.save();

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

module.exports = refreshToken;
