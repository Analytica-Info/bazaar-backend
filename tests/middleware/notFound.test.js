'use strict';

const notFound = require('../../src/middleware/notFound');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');

const {
  NotFoundError,
  isDomainError,
} = require('../../src/services/_kernel/errors');

describe('notFound middleware', () => {
  it('calls next with a NotFoundError', () => {
    const req = mockReq({ method: 'GET', path: '/unknown' });
    const next = mockNext();

    notFound(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(NotFoundError);
    expect(isDomainError(err)).toBe(true);
  });

  it('includes the method and path in the error message', () => {
    const req = mockReq({ method: 'POST', path: '/api/nonexistent' });
    const next = mockNext();

    notFound(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.message).toContain('POST');
    expect(err.message).toContain('/api/nonexistent');
  });

  it('has statusCode 404', () => {
    const req = mockReq({ method: 'DELETE', path: '/gone' });
    const next = mockNext();

    notFound(req, mockRes(), next);

    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('has error code NOT_FOUND', () => {
    const req = mockReq({ method: 'GET', path: '/x' });
    const next = mockNext();

    notFound(req, mockRes(), next);

    expect(next.mock.calls[0][0].code).toBe('NOT_FOUND');
  });

  it('does NOT send a response directly (delegates to error handler)', () => {
    const res = mockRes();
    const next = mockNext();

    notFound(mockReq({ method: 'GET', path: '/x' }), res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
