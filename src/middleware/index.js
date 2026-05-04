'use strict';

/**
 * Middleware barrel — ergonomic single-import for cross-cutting middleware.
 *
 * Usage:
 *   const { asyncHandler, errorHandler, notFound, validate, requestContext, securityHeaders } = require('./middleware');
 */

module.exports = {
  asyncHandler: require('./asyncHandler'),
  errorHandler: require('./errorHandler'),
  notFound: require('./notFound'),
  validate: require('./validate'),
  requestContext: require('./requestContext'),
  securityHeaders: require('./securityHeaders'),
  versionGate: require('./versionGate'),
};
