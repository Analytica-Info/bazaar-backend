'use strict';

const clock = require('../../../utilities/clock');
const { verifyAccessToken, verifyRefreshToken } = require('../domain/tokenIssuer');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../../../config/jwtSecret');
const JWT_REFRESH_SECRET = require('../../../config/refreshJwtSecret');
const runtimeConfig = require('../../../config/runtime');
const { User } = require('./_shared');

async function checkAccessToken(accessTokenValue, refreshTokenValue) {
    if (!accessTokenValue) throw { status: 401, message: 'Access token missing' };

    try {
        const decoded = verifyAccessToken(accessTokenValue);
        return { valid: true, message: 'Access token is valid', userId: decoded.id };
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            if (!refreshTokenValue) {
                throw { status: 401, message: 'Access token expired. Refresh token missing' };
            }

            let refreshDecoded;
            try {
                refreshDecoded = verifyRefreshToken(refreshTokenValue);
            } catch {
                throw { status: 403, message: 'Invalid or expired refresh token' };
            }

            const user = await User.findById(refreshDecoded.id);
            if (!user || !Array.isArray(user.sessions)) {
                throw { status: 403, message: 'Invalid refresh token' };
            }

            const sessionIndex = user.sessions.findIndex(s => s.refreshToken === refreshTokenValue && !s.revokedAt);
            if (sessionIndex === -1) throw { status: 403, message: 'Invalid refresh token' };

            const newAccessToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: runtimeConfig.auth.accessTokenExpiry });
            const newRefreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, { expiresIn: runtimeConfig.auth.refreshTokenExpiry });

            user.sessions[sessionIndex].refreshToken = newRefreshToken;
            user.sessions[sessionIndex].lastUsed = clock.now();
            await user.save();

            return {
                valid: false,
                message: 'Access token expired. Issued new access token',
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
            };
        }

        throw { status: 401, message: 'Invalid access token' };
    }
}

module.exports = checkAccessToken;
