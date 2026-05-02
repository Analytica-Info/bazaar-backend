'use strict';

/**
 * asyncHandler — wraps async (or sync) route handlers so that any thrown
 * error is forwarded to Express's next(err) instead of becoming an
 * unhandled rejection.
 *
 * Usage:
 *   router.get('/route', asyncHandler(async (req, res) => { ... }));
 *
 * @param {Function} fn  Express handler (req, res, next) => Promise|void
 * @returns {Function}   Middleware with arity 3
 */
function asyncHandler(fn) {
  return function asyncMiddleware(req, res, next) {
    try {
      return Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = asyncHandler;
