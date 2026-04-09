const Admin = require('../models/Admin');
const Role = require('../models/Role');
const Permission = require('../models/Permission');

const logger = require("../utilities/logger");
/**
 * Middleware to check if admin has a specific required permission.
 * Must be used after adminMiddleware (expects req.user to be set).
 *
 * @param {string} requiredPermission - The permission slug required to access the route
 */
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const admin = req.user;

      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized. Admin not found.',
        });
      }

      if (!admin.role) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. No role assigned.',
        });
      }

      const adminWithRole = await Admin.findById(admin._id).populate({
        path: 'role',
        populate: {
          path: 'permissions',
          model: 'Permission',
        },
      });

      const role = adminWithRole.role;

      if (!role || !role.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Role is inactive or not found.',
        });
      }

      const hasPermission = role.permissions.some(
        (permission) => permission.slug === requiredPermission && permission.isActive
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.',
        });
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Permission Middleware Error:');
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions.',
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to check if admin has any of the required permissions.
 * Must be used after adminMiddleware (expects req.user to be set).
 *
 * @param {string[]} requiredPermissions - Array of permission slugs
 */
const checkAnyPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      const admin = req.user;

      if (!admin || !admin.role) {
        return res.status(403).json({
          success: false,
          message: 'Access denied.',
        });
      }

      const adminWithRole = await Admin.findById(admin._id).populate({
        path: 'role',
        populate: {
          path: 'permissions',
          model: 'Permission',
        },
      });

      const role = adminWithRole.role;

      if (!role || !role.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Access denied.',
        });
      }

      const hasPermission = requiredPermissions.some((requiredPerm) =>
        role.permissions.some(
          (permission) => permission.slug === requiredPerm && permission.isActive
        )
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.',
        });
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Permission Middleware Error:');
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions.',
        error: error.message,
      });
    }
  };
};

module.exports = {
  checkPermission,
  checkAnyPermission,
};
