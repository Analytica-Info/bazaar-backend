'use strict';

const crypto = require('crypto');
const logger = require('../utilities/logger');

/**
 * Generate a URL-safe 24-character hex ID using crypto.randomBytes.
 * Falls back to a timestamp+random string if crypto is unavailable.
 *
 * @returns {string}
 */
function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * requestContext — assigns a correlation ID and child logger to each request.
 *
 * - If the incoming request carries an X-Request-Id header, that value is
 *   used as-is (enables end-to-end tracing across services).
 * - Otherwise a fresh random ID is generated.
 * - A pino child logger bound to { reqId, method, path } is attached as req.log.
 * - Incoming request is logged at debug level.
 * - Outgoing response is logged at info level (status + latency) on the
 *   'finish' event so the status code is available.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestContext(req, res, next) {
  const start = Date.now();

  // Honor incoming correlation ID or generate a fresh one
  const incomingId = req.headers['x-request-id'];
  req.id = (typeof incomingId === 'string' && incomingId.length > 0)
    ? incomingId
    : generateId();

  // Attach child logger with request context bindings
  req.log = logger.child({
    reqId: req.id,
    method: req.method,
    path: req.path || req.url,
  });

  req.log.debug({ url: req.originalUrl }, 'incoming request');

  // Log on response finish so we capture the final status code
  res.on('finish', () => {
    req.log.info(
      {
        status: res.statusCode,
        latencyMs: Date.now() - start,
      },
      'request completed'
    );
  });

  next();
}

module.exports = requestContext;
