'use strict';

const metrics = require('../services/metricsService');

/**
 * Lightweight request counter middleware.
 * Call with a source label so traffic can be broken down by origin.
 *   source: 'user-api' | 'admin-api' | 'webhook'
 */
function requestMetrics(source) {
    return (_req, _res, next) => {
        metrics.recordRequest(source).catch(() => {});
        next();
    };
}

module.exports = requestMetrics;
