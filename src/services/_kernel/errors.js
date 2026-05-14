'use strict';

/**
 * Kernel typed errors.
 *
 * All domain errors extend DomainError so catch blocks can distinguish
 * expected application errors from unexpected runtime errors.
 *
 * Usage:
 *   const { NotFoundError, isDomainError } = require('./_kernel/errors');
 *   throw new NotFoundError('Order not found', { orderId });
 *
 *   catch (err) {
 *     if (isDomainError(err)) return res.status(err.statusCode).json(toEnvelope(err));
 *     throw err; // re-throw unexpected errors
 *   }
 */

class DomainError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {string} code
   * @param {object} [details]
   */
  constructor(message, statusCode, code, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details || null;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class BadRequestError extends DomainError {
  constructor(message, details) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

class NotFoundError extends DomainError {
  constructor(message, details) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

class UnauthorizedError extends DomainError {
  constructor(message, details) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

class ForbiddenError extends DomainError {
  constructor(message, details) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

class ConflictError extends DomainError {
  constructor(message, details) {
    super(message, 409, 'CONFLICT', details);
  }
}

class UpstreamError extends DomainError {
  constructor(message, details) {
    super(message, 502, 'UPSTREAM_ERROR', details);
  }
}

class ValidationError extends DomainError {
  constructor(message, details) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Type-guard: returns true if err is a DomainError instance.
 * @param {unknown} err
 * @returns {err is DomainError}
 */
function isDomainError(err) {
  return err instanceof DomainError;
}

/**
 * Convert a DomainError to the v1-compat envelope shape expected by
 * existing error-handling middleware: { status, message, code, details }.
 *
 * @param {DomainError} err
 * @returns {{ status: number, message: string, code: string, details: object|null }}
 */
function toEnvelope(err) {
  return {
    status: err.statusCode,
    message: err.message,
    code: err.code,
    details: err.details,
  };
}

module.exports = {
  DomainError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UpstreamError,
  ValidationError,
  isDomainError,
  toEnvelope,
};
