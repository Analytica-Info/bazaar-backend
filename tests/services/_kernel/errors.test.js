'use strict';

const {
  DomainError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UpstreamError,
  ValidationError,
  isDomainError,
  toEnvelope,
} = require('../../../src/services/_kernel/errors');

describe('DomainError base class', () => {
  it('sets message, statusCode, code, and name', () => {
    const err = new DomainError('base msg', 418, 'TEAPOT');
    expect(err.message).toBe('base msg');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.name).toBe('DomainError');
    expect(err).toBeInstanceOf(Error);
  });

  it('sets details to null when not provided', () => {
    const err = new DomainError('msg', 400, 'CODE');
    expect(err.details).toBeNull();
  });

  it('stores details when provided', () => {
    const details = { field: 'email' };
    const err = new DomainError('msg', 400, 'CODE', details);
    expect(err.details).toEqual(details);
  });

  it('has a stack trace', () => {
    const err = new DomainError('msg', 400, 'CODE');
    expect(typeof err.stack).toBe('string');
  });
});

describe('BadRequestError', () => {
  it('has statusCode 400 and code BAD_REQUEST', () => {
    const err = new BadRequestError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('bad input');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('accepts details', () => {
    const err = new BadRequestError('bad', { param: 'x' });
    expect(err.details).toEqual({ param: 'x' });
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404 and code NOT_FOUND', () => {
    const err = new NotFoundError('resource not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err).toBeInstanceOf(DomainError);
  });
});

describe('UnauthorizedError', () => {
  it('has statusCode 401 and code UNAUTHORIZED', () => {
    const err = new UnauthorizedError('token missing');
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});

describe('ForbiddenError', () => {
  it('has statusCode 403 and code FORBIDDEN', () => {
    const err = new ForbiddenError('access denied');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('ConflictError', () => {
  it('has statusCode 409 and code CONFLICT', () => {
    const err = new ConflictError('already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('UpstreamError', () => {
  it('has statusCode 502 and code UPSTREAM_ERROR', () => {
    const err = new UpstreamError('payment gateway down');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('UPSTREAM_ERROR');
  });
});

describe('ValidationError', () => {
  it('has statusCode 400 and code VALIDATION_ERROR', () => {
    const err = new ValidationError('invalid email');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});

describe('isDomainError', () => {
  it('returns true for DomainError instances', () => {
    expect(isDomainError(new DomainError('x', 400, 'X'))).toBe(true);
  });

  it('returns true for all subclasses', () => {
    expect(isDomainError(new BadRequestError('x'))).toBe(true);
    expect(isDomainError(new NotFoundError('x'))).toBe(true);
    expect(isDomainError(new UnauthorizedError('x'))).toBe(true);
    expect(isDomainError(new ForbiddenError('x'))).toBe(true);
    expect(isDomainError(new ConflictError('x'))).toBe(true);
    expect(isDomainError(new UpstreamError('x'))).toBe(true);
    expect(isDomainError(new ValidationError('x'))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isDomainError(new Error('plain'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDomainError(null)).toBe(false);
  });

  it('returns false for a plain object', () => {
    expect(isDomainError({ statusCode: 400 })).toBe(false);
  });
});

describe('toEnvelope', () => {
  it('maps DomainError to v1-compat envelope shape', () => {
    const err = new NotFoundError('Order not found', { orderId: '42' });
    const envelope = toEnvelope(err);
    expect(envelope).toEqual({
      status: 404,
      message: 'Order not found',
      code: 'NOT_FOUND',
      details: { orderId: '42' },
    });
  });

  it('sets details to null when not provided', () => {
    const err = new BadRequestError('bad input');
    const envelope = toEnvelope(err);
    expect(envelope.details).toBeNull();
    expect(envelope.status).toBe(400);
    expect(envelope.code).toBe('BAD_REQUEST');
  });

  it('returns an object with exactly four keys', () => {
    const envelope = toEnvelope(new UpstreamError('down'));
    expect(Object.keys(envelope).sort()).toEqual(['code', 'details', 'message', 'status']);
  });
});
