'use strict';

const asyncHandler = require('../../src/middleware/asyncHandler');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');

describe('asyncHandler', () => {
  it('calls next(err) when an async handler rejects', async () => {
    const err = new Error('async boom');
    const handler = asyncHandler(async (_req, _res, _next) => {
      throw err;
    });
    const next = mockNext();

    await handler(mockReq(), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('calls next(err) when a sync handler throws', async () => {
    const err = new Error('sync boom');
    const handler = asyncHandler((_req, _res, _next) => {
      throw err;
    });
    const next = mockNext();

    await handler(mockReq(), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('does NOT call next(err) when handler resolves normally', async () => {
    const handler = asyncHandler(async (_req, res, _next) => {
      res.json({ ok: true });
    });
    const res = mockRes();
    const next = mockNext();

    await handler(mockReq(), res, next);

    expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('passes req, res, next into the wrapped handler', async () => {
    const inner = jest.fn().mockResolvedValue(undefined);
    const handler = asyncHandler(inner);
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    await handler(req, res, next);

    expect(inner).toHaveBeenCalledWith(req, res, next);
  });

  it('returns a function with arity 3', () => {
    const handler = asyncHandler(async () => {});
    expect(typeof handler).toBe('function');
    expect(handler.length).toBe(3);
  });
});
