'use strict';

const { NotFoundError } = require('../services/_kernel/errors');

/**
 * notFound — catch-all 404 handler.
 * Must be mounted AFTER all real routes so it only fires for unmatched paths.
 * Delegates response emission to the global errorHandler via next(err).
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function notFound(req, res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
}

module.exports = notFound;
