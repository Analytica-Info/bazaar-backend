'use strict';

/**
 * authService.js — thin facade (PR-MOD-6).
 *
 * All logic has been extracted to src/services/auth/.
 * This file re-exports every named export from the auth barrel so
 * that all existing consumers (controllers, tests, routes) continue
 * to work without modification.
 *
 * Export contract (must remain identical to pre-refactor snapshot):
 *   _helpers, appleLogin, checkAccessToken, deleteAccount,
 *   deleteAccountPublic, forgotPassword, getUserData, googleLogin,
 *   loginWithCredentials, refreshToken, register, resendRecoveryCode,
 *   resetPassword, updatePassword, updateProfile, verifyCode, verifyRecoveryCode
 */

const auth = require('./auth');

module.exports = auth;
