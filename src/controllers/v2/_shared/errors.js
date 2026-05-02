/**
 * Shared error-handling helper for v2 controllers.
 * Maps service-layer thrown objects { status, message } to HTTP responses
 * using the standard v2 response envelope.
 */
const { wrapError } = require('./responseEnvelope');
const { DomainError, isDomainError } = require('../../../services/_kernel/errors');

const HTTP_CODE_MAP = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    402: 'PAYMENT_REQUIRED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
};

/**
 * Send an error response derived from a caught service error.
 * Usage: return handleError(res, error);
 */
exports.handleError = (res, error) => {
    const status = error.status || 500;
    const code = error.code || HTTP_CODE_MAP[status] || 'INTERNAL_ERROR';
    const isProd = process.env.NODE_ENV === 'production';
    const isServerError = status >= 500;
    const message = (isServerError && isProd)
        ? 'Internal server error'
        : (error.message || 'Internal server error');
    const details = isServerError && isProd ? undefined : error.data;
    return res.status(status).json(wrapError(code, message, details));
};

/**
 * Convert a service-layer plain-object error or any Error into a DomainError
 * so it flows correctly through the global errorHandler.
 *
 * Service layer throws: { status, message, code?, data? }
 * This bridges those into typed DomainErrors that errorHandler recognises.
 *
 * Usage (in asyncHandler-wrapped controllers):
 *   } catch (err) { throw toDomainError(err); }
 *
 * @param {unknown} err
 * @returns {DomainError}
 */
exports.toDomainError = (err) => {
    if (isDomainError(err)) return err;
    const status = (err && err.status) || 500;
    const code = (err && err.code) || HTTP_CODE_MAP[status] || 'INTERNAL_ERROR';
    const isProd = process.env.NODE_ENV === 'production';
    const isServerError = status >= 500;
    const message = (isServerError && isProd)
        ? 'Internal server error'
        : ((err && err.message) || 'Internal server error');
    const details = (isServerError && isProd) ? undefined : (err && err.data);
    return new DomainError(message, status, code, details || null);
};
