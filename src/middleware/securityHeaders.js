'use strict';

/**
 * securityHeaders — lightweight security header middleware.
 *
 * NOTE: server.js already applies helmet(). This middleware is intentionally
 * kept as a stand-alone layer so it can be used in isolated test apps and
 * in contexts where helmet is not present.
 *
 * Headers applied:
 *   X-Content-Type-Options: nosniff
 *   X-Frame-Options: DENY
 *   Referrer-Policy: strict-origin-when-cross-origin
 *   X-XSS-Protection: 0  (disable legacy auditor; use CSP instead)
 *   Strict-Transport-Security: max-age=... (production only)
 *
 * CSP is intentionally OFF here — it requires per-app nonce/hash configuration
 * and should be applied at the reverse-proxy or via a dedicated CSP middleware.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  next();
}

module.exports = securityHeaders;
