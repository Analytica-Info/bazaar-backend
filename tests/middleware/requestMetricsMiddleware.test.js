'use strict';

jest.mock('../../src/services/metricsService', () => ({
  recordRequest: jest.fn().mockResolvedValue(undefined),
}));

const metrics = require('../../src/services/metricsService');
const requestMetrics = require('../../src/middleware/requestMetricsMiddleware');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');

describe('requestMetricsMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  const sources = ['user-api', 'admin-api', 'webhook'];

  test.each(sources.map(s => [s]))('records request for source "%s"', async (source) => {
    const mw = requestMetrics(source);
    const next = mockNext();

    mw(mockReq(), mockRes(), next);

    // next is called synchronously
    expect(next).toHaveBeenCalledTimes(1);
    // recordRequest is called with the source label
    expect(metrics.recordRequest).toHaveBeenCalledWith(source);
  });

  it('calls next even when recordRequest rejects', async () => {
    metrics.recordRequest.mockRejectedValueOnce(new Error('redis down'));
    const mw = requestMetrics('user-api');
    const next = mockNext();

    mw(mockReq(), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    // Allow the rejected promise to settle — no unhandled rejection
    await Promise.resolve();
  });

  it('returns a middleware function (factory pattern)', () => {
    const mw = requestMetrics('admin-api');
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3); // (req, res, next)
  });
});
