const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const JWT_SECRET = require('../config/jwtSecret');

const logger = require("../utilities/logger");
const adminMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await Admin.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(402).json({ message: 'Token expired. Please log in again.' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token. Please log in again.' });
    } else {
      logger.error({ err: error }, 'Unexpected error:');
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

module.exports = adminMiddleware;
