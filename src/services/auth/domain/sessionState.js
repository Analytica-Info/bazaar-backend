'use strict';

/**
 * sessionState.js — session management helpers.
 *
 * Pure logic — operates on user session arrays.
 * No I/O. Uses clock seam.
 */

const clock = require('../../../utilities/clock');

const MAX_SESSIONS = 10;

/**
 * Extract device information from HTTP request headers.
 *
 * @param {object} headers
 * @returns {{ deviceId: string|null, userAgent: string|null, ip: string|null, fcmToken: string|null }}
 */
function getDeviceInfo(headers) {
    const deviceId = headers['x-device-id'] || null;
    const userAgent = headers['user-agent'] || null;
    const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || null;
    const fcmToken = headers['x-fcm-token'] || null;
    return { deviceId, userAgent, ip, fcmToken };
}

/**
 * Upsert a session entry for the given device on the user document.
 *
 * Mutates `user.sessions` in-place. Caller is responsible for persisting
 * the user document.
 *
 * @param {object} user - Mongoose user document with a `sessions` array
 * @param {{ deviceId?: string, userAgent?: string, ip?: string, fcmToken?: string }} deviceInfo
 * @param {string} refreshToken
 * @returns {string} stableDeviceId used for this session
 */
function upsertSession(user, { deviceId, userAgent, ip, fcmToken }, refreshToken) {
    const stableDeviceId = deviceId || `${userAgent || 'unknown'}:${(Math.random() + 1).toString(36).slice(2)}`;
    if (!Array.isArray(user.sessions)) user.sessions = [];

    let session = user.sessions.find(s => s.deviceId === stableDeviceId);
    if (session) {
        session.refreshToken = refreshToken;
        session.userAgent = userAgent;
        session.ip = ip;
        session.lastUsed = clock.now();
        session.revokedAt = null;
        if (fcmToken) session.fcmToken = fcmToken;
    } else {
        user.sessions.push({
            deviceId: stableDeviceId,
            refreshToken,
            fcmToken: fcmToken || null,
            userAgent,
            ip,
            createdAt: clock.now(),
            lastUsed: clock.now(),
            revokedAt: null,
        });
        if (user.sessions.length > MAX_SESSIONS) {
            user.sessions.sort((a, b) => new Date(a.lastUsed) - new Date(b.lastUsed));
            user.sessions = user.sessions.slice(-MAX_SESSIONS);
        }
    }
    return stableDeviceId;
}

module.exports = { getDeviceInfo, upsertSession, MAX_SESSIONS };
