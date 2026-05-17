'use strict';

/**
 * withAuthErrors — wraps a v2 auth handler so that any service-layer error
 * is translated through authErrorMap before being sent to the client.
 *
 * This is the Option-A (non-invasive) integration pattern: the translation
 * happens at the controller boundary without touching the service layer or
 * the global error middleware.
 *
 * Usage:
 *   exports.login = withAuthErrors(asyncHandler(async (req, res) => { ... }));
 */

const { translateAuthError } = require('./authErrorMap');
const { wrapError } = require('./responseEnvelope');

/**
 * @param {Function} handler - An Express handler (possibly already wrapped by asyncHandler)
 * @returns {Function}       - Express-compatible handler with auth error translation
 */
function withAuthErrors(handler) {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (err) {
            const { status, code, message } = translateAuthError(err);
            return res.status(status).json(wrapError(code, message));
        }
    };
}

module.exports = { withAuthErrors };
