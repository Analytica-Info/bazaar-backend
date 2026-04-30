/**
 * V2 authentication middleware.
 *
 * Differences from authMiddleware.js (v1):
 * - Always returns 401 on expired token (no 402 for cookie clients)
 * - Uses .lean() on the user fetch for performance
 * - Exposes optional() and required() variants
 * - USER_AUTH_PROJECTION identical to v1 (audited 2026-04-24)
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const JWT_SECRET = require('../config/jwtSecret');
const cache = require('../utilities/cache');
const logger = require('../utilities/logger');

const USER_AUTH_PROJECTION =
    '_id isBlocked name first_name email username avatar role phone authProvider fcmToken createdAt';

const LAST_SEEN_TTL_SECONDS = 300;

async function authenticate(req, res, next, { required: isRequired = true, role = 'user' } = {}) {
    let token = null;

    if (req.cookies?.user_token) {
        token = req.cookies.user_token;
    } else {
        token = req.header('Authorization')?.replace('Bearer ', '') || null;
    }

    if (!token) {
        if (!isRequired) {
            req.user = null;
            return next();
        }
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        let userData;

        if (role === 'admin') {
            userData = await Admin.findById(decoded.id).populate('role').lean();
        } else {
            userData = await User.findById(decoded.id).select(USER_AUTH_PROJECTION).lean();
        }

        if (!userData) {
            return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
        }

        if (userData.isBlocked) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Your account has been blocked' } });
        }

        req.user = userData;
        req.userRole = role;

        if (role === 'user') {
            const throttleKey = cache.key('lastSeen', String(userData._id));
            const recent = await cache.get(throttleKey);
            if (!recent) {
                await cache.set(throttleKey, '1', LAST_SEEN_TTL_SECONDS);
                User.updateOne({ _id: userData._id }, { $set: { lastSeen: new Date() } }).catch(() => {});
            }
        }

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            // V2 always returns 401 (unlike v1 which returns 402 for cookie clients)
            return res.status(401).json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Token expired. Please log in again.' } });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } });
        }
        logger.error({ err: error }, 'authV2 middleware error:');
        return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
}

/** Require authentication — 401 if missing or invalid. */
exports.required = (role = 'user') => (req, res, next) =>
    authenticate(req, res, next, { required: true, role });

/** Optional authentication — attaches req.user if token present, null otherwise. */
exports.optional = () => (req, res, next) =>
    authenticate(req, res, next, { required: false });
