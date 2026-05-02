'use strict';

const logger = require('../utilities/logger');
const { isDomainError } = require('../services/_kernel/errors');
const { wrapError } = require('../controllers/v2/_shared/responseEnvelope');

const MULTER_CODES = new Set([
  'LIMIT_FILE_SIZE',
  'LIMIT_FILE_COUNT',
  'LIMIT_FIELD_KEY',
  'LIMIT_FIELD_VALUE',
  'LIMIT_FIELD_COUNT',
  'LIMIT_UNEXPECTED_FILE',
  'LIMIT_PART_COUNT',
]);

/**
 * Classify an error and return { status, code, message, details }.
 *
 * Priority order:
 *  1. DomainError (our typed hierarchy)
 *  2. Mongoose ValidationError
 *  3. Mongoose CastError
 *  4. MongoDB duplicate key (code 11000)
 *  5. JWT errors
 *  6. Multer errors
 *  7. CORS rejection
 *  8. Legacy plain-object throws { status, message }
 *  9. Generic Error → 500
 */
function classify(err) {
  // 1. DomainError
  if (isDomainError(err)) {
    return {
      status: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details || undefined,
    };
  }

  // 2. Mongoose ValidationError
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details,
    };
  }

  // 3. Mongoose CastError
  if (err.name === 'CastError') {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message: `Invalid ${err.kind || 'value'} for field ${err.path || 'unknown'}`,
      details: undefined,
    };
  }

  // 4. MongoDB duplicate key
  if (err.code === 11000) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'unknown';
    return {
      status: 409,
      code: 'CONFLICT',
      message: `Duplicate value for field: ${field}`,
      details: err.keyValue || undefined,
    };
  }

  // 5. JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return {
      status: 401,
      code: 'UNAUTHORIZED',
      message: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token',
      details: undefined,
    };
  }

  // 6. Multer errors
  if (MULTER_CODES.has(err.code)) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message: err.message || 'File upload error',
      details: undefined,
    };
  }

  // 7. CORS rejection
  if (err.message === 'Not allowed by CORS') {
    return {
      status: 403,
      code: 'FORBIDDEN',
      message: 'CORS not allowed',
      details: undefined,
    };
  }

  // 8. Legacy plain-object / express errors with .status
  if (err.status && typeof err.status === 'number') {
    // BUG-034: path 8 lacked 500/5xx entries, causing plain-object { status: 500 }
    // throws to emit code 'ERROR' instead of 'INTERNAL_ERROR'. Added 500 and 503.
    const HTTP_CODE_MAP = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
      502: 'UPSTREAM_ERROR',
      503: 'INTERNAL_ERROR',
    };
    const code = (err.code && typeof err.code === 'string') ? err.code
      : (HTTP_CODE_MAP[err.status] || (err.status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'));
    return {
      status: err.status,
      code,
      message: err.message || 'An error occurred',
      details: err.data || err.details || undefined,
    };
  }

  // 9. Generic unknown error — 500, no leak in production
  const isProd = process.env.NODE_ENV === 'production';
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: isProd ? 'Internal server error' : (err.message || 'Internal server error'),
    details: undefined,
    isUnexpected: true,
  };
}

/**
 * Global error handler middleware.
 *
 * Must be registered AFTER all routes and AFTER the notFound handler.
 * Detect v1 vs v2 by req.path prefix and emit the matching envelope shape.
 *
 * v1 shape: { success: false, error: <string>, message: <string> }
 * v2 shape: { success: false, error: { code, message, ?details } }
 *
 * @type {import('express').ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const classified = classify(err);

  // Log unexpected errors with full stack; domain errors at warn level
  if (classified.isUnexpected) {
    logger.error(
      {
        err,
        method: req.method,
        url: req.originalUrl,
      },
      'Unhandled error'
    );
  }

  const isV2 = req.path && req.path.startsWith('/v2');

  if (isV2) {
    // v2 full envelope
    const body = wrapError(classified.code, classified.message, classified.details);
    return res.status(classified.status).json(body);
  }

  // v1 shape — backwards-compatible
  const body = {
    success: false,
    message: classified.message,
  };
  if (classified.details !== undefined) {
    body.details = classified.details;
  }

  return res.status(classified.status).json(body);
}

module.exports = errorHandler;
