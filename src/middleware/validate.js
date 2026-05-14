'use strict';

const { ValidationError } = require('../services/_kernel/errors');

/**
 * validate — middleware factory that validates request input against a schema
 * function before the route handler runs.
 *
 * Schema contract:
 *   schema(input) => { ok: boolean, errors: Array<{ field: string, message: string }> }
 *
 * Usage:
 *   router.post('/items', validate(itemSchema), handler);
 *   router.get('/search', validate(querySchema, 'query'), handler);
 *
 * @param {Function} schema  Validation function matching the contract above
 * @param {'body'|'query'|'params'} [source='body']  Where to pull input from
 * @returns {Function}  Express middleware (req, res, next)
 */
function validate(schema, source = 'body') {
  return function validationMiddleware(req, res, next) {
    const input = req[source] || {};
    const result = schema(input);

    if (result.ok) {
      return next();
    }

    next(new ValidationError('Validation failed', result.errors));
  };
}

module.exports = validate;
