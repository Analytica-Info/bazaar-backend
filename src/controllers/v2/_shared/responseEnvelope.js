/**
 * Consistent response envelope for all v2 API responses.
 * All v2 controllers must use these helpers instead of raw res.json().
 */

/**
 * Standard success response.
 * @param {*} data - Payload to return.
 * @param {string} [message]
 */
exports.wrap = (data, message) => ({
    success: true,
    ...(message ? { message } : {}),
    data,
});

/**
 * Paginated success response.
 */
exports.paginated = (items, total, page, limit) => ({
    success: true,
    data: items,
    meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
    },
});

/**
 * Error response.
 * @param {string} code - Machine-readable error code e.g. 'NOT_FOUND'
 * @param {string} message - Human-readable message
 * @param {*} [details] - Optional extra context (validation errors, etc.)
 */
exports.wrapError = (code, message, details) => ({
    success: false,
    error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
    },
});
