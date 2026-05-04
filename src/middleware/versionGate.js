'use strict';

/**
 * versionGate.js — mobile version enforcement middleware.
 *
 * Reads the `x-app-version` header sent by mobile clients. If the version
 * is below the configured minimum AND enforcement is enabled, returns
 * 426 Upgrade Required with a body that mobile can use to show a
 * force-update dialog.
 *
 * When enforcement is disabled (default), stale versions are only logged
 * as a warning — the request proceeds normally. This lets the middleware
 * be deployed inert until the mobile side ships BUG-053.
 *
 * Web / admin / cURL clients that don't send the header are always allowed
 * through — no header means no version gate.
 *
 * Mount AFTER requestContext so req.log (child logger with reqId) is available.
 */

const runtimeConfig = require('../config/runtime');
const { isVersionLess } = require('../utilities/semver');
const logger = require('../utilities/logger');

const FORCE_UPDATE_MESSAGE =
  'This version of the app is no longer supported. Please update to continue.';

/**
 * Detect platform from the User-Agent header.
 * Mobile clients set by auth_controller.dart include 'android' or 'ios' in
 * the user-agent string (lower-cased by Express).
 *
 * @param {string | undefined} userAgent
 * @returns {'ios' | 'android' | null}
 */
function detectPlatform(userAgent) {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('ios')) return 'ios';
  return null;
}

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function versionGate(req, res, next) {
  const clientVersion = req.headers['x-app-version'];

  // No header — web / admin / cURL bypass.
  if (!clientVersion) {
    return next();
  }

  const { minSupportedVersion, enforceMinVersion, updateUrls } = runtimeConfig.mobile;

  const tooOld = isVersionLess(clientVersion, minSupportedVersion);

  if (!tooOld) {
    return next();
  }

  // Version is below minimum.
  const platform = detectPlatform(req.headers['user-agent']);
  const updateUrl = platform ? updateUrls[platform] : null;

  const logPayload = {
    clientVersion,
    minimumVersion: minSupportedVersion,
    path: req.originalUrl || req.path,
    platform: platform || 'unknown',
    enforced: enforceMinVersion,
  };

  if (!enforceMinVersion) {
    // Observe-only mode: log and let the request through.
    const log = req.log || logger;
    log.warn({ versionGate: logPayload }, 'versionGate: stale client version (not enforced)');
    return next();
  }

  // Enforcement is on — return 426.
  return res.status(426).json({
    forceUpdate: true,
    currentVersion: clientVersion,
    minimumVersion: minSupportedVersion,
    updateUrl,
    message: FORCE_UPDATE_MESSAGE,
  });
}

module.exports = versionGate;
