/**
 * Shared error-handling helper for v2 controllers.
 * Maps service-layer thrown objects { status, message } to HTTP responses
 * using the standard v2 response envelope.
 */
const { wrapError } = require('./responseEnvelope');

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
    if (error.status && error.data) {
        return res.status(error.status).json({ success: false, ...error.data });
    }
    const status = error.status || 500;
    const code = HTTP_CODE_MAP[status] || 'INTERNAL_ERROR';
    return res.status(status).json(wrapError(code, error.message || 'Internal server error'));
};
