const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const JWT_SECRET = require('../config/jwtSecret');

const logger = require("../utilities/logger");
/**
 * Core authentication handler.
 * Extracts token from cookies (web) or Authorization header (mobile/admin),
 * verifies it, and attaches the user to the request.
 *
 * @param {string} role - 'user' or 'admin'
 * @returns {Function} Express middleware
 */
const handler = (role = 'user') => {
  return async (req, res, next) => {
    let tokenFromCookie = false;
    try {
      // Try cookie first (web), then Authorization header (mobile/admin)
      let token = null;

      if (req.cookies?.user_token) {
        token = req.cookies.user_token;
        tokenFromCookie = true;
      } else {
        token = req.header('Authorization')?.replace('Bearer ', '') || null;
      }

      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      let userData;

      if (role === 'admin') {
        userData = await Admin.findById(decoded.id).populate('role');
      } else {
        userData = await User.findById(decoded.id);
      }

      if (!userData) {
        return res.status(401).json({ message: 'Unauthorized - User not found' });
      }

      if (userData.isBlocked) {
        return res.status(403).json({ message: 'Your account has been blocked' });
      }

      req.user = userData;
      req.userRole = role;

      // Update lastSeen for user requests — fire-and-forget, never blocks the response
      if (role === 'user') {
        User.updateOne({ _id: userData._id }, { $set: { lastSeen: new Date() } }).catch(() => {});
      }

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        // Web clients (cookie auth) expect 402; mobile clients (Bearer) expect 401
        const expiredStatus = tokenFromCookie ? 402 : 401;
        return res.status(expiredStatus).json({ message: 'Token expired. Please log in again.' });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
      } else {
        logger.error({ err: error }, 'Auth middleware error:');
        return res.status(500).json({ message: 'Internal server error' });
      }
    }
  };
};

/**
 * Unified auth middleware that supports two calling conventions:
 *
 * 1. Factory style (Ecommerce):  authMiddleware('admin')  -> returns middleware
 * 2. Direct style (Mobile API):  authMiddleware            -> used as middleware directly
 *
 * Detection: if first argument is a request object (has .headers), treat as direct invocation.
 */
function authMiddleware(roleOrReq, res, next) {
  // Direct invocation as middleware: authMiddleware(req, res, next)
  if (typeof roleOrReq === 'object' && roleOrReq.headers) {
    return handler('user')(roleOrReq, res, next);
  }

  // Factory invocation: authMiddleware('admin') or authMiddleware('user')
  return handler(roleOrReq || 'user');
}

module.exports = authMiddleware;
