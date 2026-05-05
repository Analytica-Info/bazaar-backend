'use strict';

jest.mock('../../src/utilities/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  child: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const logger = require('../../src/utilities/logger');
const requestContext = require('../../src/middleware/requestContext');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');

// Helper to simulate response finish event
function simulateResponseFinish(res) {
  if (res._finishListeners) {
    res._finishListeners.forEach((fn) => fn());
  }
}

function makeRes() {
  const listeners = {};
  const res = mockRes();
  res._finishListeners = [];
  res.on = jest.fn((event, fn) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    if (event === 'finish') res._finishListeners.push(fn);
  });
  res.statusCode = 200;
  return res;
}

describe('requestContext middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('assigns req.id (a non-empty string)', () => {
    const req = mockReq({ method: 'GET', path: '/test', originalUrl: '/test' });
    const res = makeRes();
    const next = mockNext();

    requestContext(req, res, next);

    expect(typeof req.id).toBe('string');
    expect(req.id.length).toBeGreaterThan(0);
  });

  it('honors X-Request-Id header when present', () => {
    const req = mockReq({
      method: 'GET',
      path: '/test',
      originalUrl: '/test',
      headers: { 'x-request-id': 'custom-id-123' },
    });
    const res = makeRes();
    const next = mockNext();

    requestContext(req, res, next);

    expect(req.id).toBe('custom-id-123');
  });

  it('assigns req.log (a child logger)', () => {
    const req = mockReq({ method: 'GET', path: '/test', originalUrl: '/test' });
    const res = makeRes();
    const next = mockNext();

    requestContext(req, res, next);

    expect(req.log).toBeDefined();
    expect(typeof req.log.info).toBe('function');
  });

  it('creates child logger with reqId, method, path bindings', () => {
    const req = mockReq({ method: 'POST', path: '/api/items', originalUrl: '/api/items' });
    const res = makeRes();
    const next = mockNext();

    requestContext(req, res, next);

    expect(logger.child).toHaveBeenCalledWith(
      expect.objectContaining({
        reqId: req.id,
        method: 'POST',
        path: '/api/items',
      })
    );
  });

  it('logs incoming request at debug level', () => {
    const req = mockReq({ method: 'GET', path: '/ping', originalUrl: '/ping' });
    const res = makeRes();
    const next = mockNext();

    requestContext(req, res, next);

    const childLog = logger.child.mock.results[0].value;
    expect(childLog.debug).toHaveBeenCalled();
  });

  it('logs outgoing response at info level on finish', () => {
    const req = mockReq({ method: 'GET', path: '/ping', originalUrl: '/ping' });
    const res = makeRes();
    const next = mockNext();

    requestContext(req, res, next);

    // Simulate response finish
    simulateResponseFinish(res);

    const childLog = logger.child.mock.results[0].value;
    expect(childLog.info).toHaveBeenCalled();
  });

  it('includes status and latency in response log', () => {
    const req = mockReq({ method: 'GET', path: '/ping', originalUrl: '/ping' });
    const res = makeRes();
    res.statusCode = 201;
    const next = mockNext();

    requestContext(req, res, next);
    simulateResponseFinish(res);

    const childLog = logger.child.mock.results[0].value;
    const infoCall = childLog.info.mock.calls[0];
    // First arg is data object, second is message string
    expect(infoCall[0]).toHaveProperty('status', 201);
    expect(infoCall[0]).toHaveProperty('latencyMs');
  });

  it('calls next()', () => {
    const req = mockReq({ method: 'GET', path: '/test', originalUrl: '/test' });
    const res = makeRes();
    const next = mockNext();

    requestContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('generates unique ids for different requests', () => {
    const ids = new Set();
    for (let i = 0; i < 10; i++) {
      const req = mockReq({ method: 'GET', path: '/x', originalUrl: '/x' });
      const res = makeRes();
      requestContext(req, res, mockNext());
      ids.add(req.id);
    }
    expect(ids.size).toBe(10);
  });
});
