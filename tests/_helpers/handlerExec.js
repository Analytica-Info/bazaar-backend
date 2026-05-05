'use strict';

/**
 * runHandler — test-fixture helper for unit-testing Express controller handlers
 * that use asyncHandler + throw DomainError (or toDomainError) for error paths.
 *
 * When a handler throws instead of calling res.status().json() directly, calling
 * it as `await handler(req, res)` leaves the test with an unhandled rejection and
 * no response assertion. This helper routes the error through the real global
 * errorHandler so tests can keep asserting `res.status` and `res.json` shapes.
 *
 * Usage:
 *   const { runHandler } = require('../_helpers/handlerExec');
 *   const { statusCode, body } = await runHandler(ctrl.login, req);
 *
 * The returned object mirrors the mock `res` shape:
 *   {
 *     statusCode,          // number, default 200
 *     body,                // value passed to res.json()
 *     headers,             // object, set via res.set() / res.cookie() calls
 *     res,                 // the full mock res for cookie/clearCookie assertions
 *   }
 *
 * The helper accepts an optional `path` option to control v1 vs v2 error-envelope
 * detection in errorHandler (default '/test', use '/v2/test' for v2 envelope).
 *
 *   const { body } = await runHandler(ctrl.login, req, { path: '/v2/test' });
 */

const errorHandler = require('../../src/middleware/errorHandler');

/**
 * @param {Function} handler  - Express handler (req, res, next) or (req, res)
 * @param {object}   req      - Mock request object
 * @param {object}   [opts]
 * @param {string}   [opts.path='/test']  - req.path value used by errorHandler to pick v1/v2 envelope
 * @returns {Promise<{ statusCode: number, body: any, headers: object, res: object }>}
 */
async function runHandler(handler, req, opts = {}) {
  const path = opts.path || '/test';

  // Track response state
  let statusCode = 200;
  let body;
  const headers = {};

  const res = {
    _statusCode: 200,
    status: jest.fn(function (code) { statusCode = code; this._statusCode = code; return this; }),
    json: jest.fn(function (data) { body = data; return this; }),
    send: jest.fn(function (data) { body = data; return this; }),
    cookie: jest.fn(function () { return this; }),
    clearCookie: jest.fn(function () { return this; }),
    set: jest.fn(function (k, v) { headers[k] = v; return this; }),
    setHeader: jest.fn(function (k, v) { headers[k] = v; return this; }),
    // errorHandler reads req.path — attach it here for the finalNext check
  };

  // Augment the req with path for errorHandler routing
  const reqWithPath = { ...req, path, originalUrl: path };

  return new Promise((resolve, reject) => {
    // next() is called when the handler throws (via asyncHandler) or calls next(err)
    const next = (err) => {
      if (!err) {
        // next() with no error — handler completed without sending; resolve with current state
        resolve({ statusCode, body, headers, res });
        return;
      }

      // Route error through the real errorHandler
      // eslint-disable-next-line no-unused-vars
      const finalNext = (_err2) => {
        // errorHandler should not call next again, but handle gracefully
        resolve({ statusCode, body, headers, res });
      };

      try {
        errorHandler(err, reqWithPath, res, finalNext);
        resolve({ statusCode, body, headers, res });
      } catch (handlerErr) {
        reject(handlerErr);
      }
    };

    // Run the handler — may be async or sync
    Promise.resolve()
      .then(() => handler(reqWithPath, res, next))
      .then(() => {
        // Handler completed without calling next — res.json/send was called
        resolve({ statusCode, body, headers, res });
      })
      .catch((err) => {
        // Handler threw synchronously outside asyncHandler wrapping
        next(err);
      });
  });
}

module.exports = { runHandler };
