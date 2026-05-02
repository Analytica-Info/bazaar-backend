'use strict';

/**
 * Thin facade — preserves the original module-level export contract.
 * All logic lives in src/services/admin/use-cases/ and src/services/admin/domain/.
 *
 * Consumers that already require('./adminService') continue to work unchanged.
 * New code should prefer requiring './admin' (the barrel) directly.
 */
const admin = require('./admin');

exports.adminRegister          = admin.adminRegister;
exports.adminLogin             = admin.adminLogin;
exports.forgotPassword         = admin.forgotPassword;
exports.verifyCode             = admin.verifyCode;
exports.resetPassword          = admin.resetPassword;
exports.updatePassword         = admin.updatePassword;

exports.getCurrentAdmin        = admin.getCurrentAdmin;
exports.getAllAdmins            = admin.getAllAdmins;
exports.getAdminById           = admin.getAdminById;
exports.createSubAdmin         = admin.createSubAdmin;
exports.updateSubAdmin         = admin.updateSubAdmin;
exports.deleteSubAdmin         = admin.deleteSubAdmin;

exports.getAllUsers             = admin.getAllUsers;
exports.exportUsers            = admin.exportUsers;
exports.getUserById            = admin.getUserById;
exports.blockUser              = admin.blockUser;
exports.unblockUser            = admin.unblockUser;
exports.deleteUser             = admin.deleteUser;
exports.restoreUser            = admin.restoreUser;
exports.updateUser             = admin.updateUser;

exports.getOrders              = admin.getOrders;
exports.getCoupons             = admin.getCoupons;
exports.updateOrderStatus      = admin.updateOrderStatus;

exports.getProductAnalytics    = admin.getProductAnalytics;
exports.exportProductAnalytics = admin.exportProductAnalytics;
exports.getProductViewDetails  = admin.getProductViewDetails;

exports.getActivityLogs        = admin.getActivityLogs;
exports.getActivityLogById     = admin.getActivityLogById;
exports.downloadActivityLogs   = admin.downloadActivityLogs;

exports.getBackendLogs         = admin.getBackendLogs;
exports.getBackendLogByDate    = admin.getBackendLogByDate;
exports.downloadBackendLogs    = admin.downloadBackendLogs;
