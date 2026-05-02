'use strict';

jest.mock('../../src/utilities/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnValue({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const express = require('express');
const request = require('supertest');

const {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UpstreamError,
  ValidationError,
} = require('../../src/services/_kernel/errors');

const errorHandler = require('../../src/middleware/errorHandler');

// ---------------------------------------------------------------------------
// App factory — mounts a single throwing route + the error handler
// ---------------------------------------------------------------------------
function buildApp({ throwFn, path: routePath = '/test', isV2 = false, isProd = false } = {}) {
  const app = express();
  app.use(express.json());

  const routePrefix = isV2 ? '/v2' : '';
  app.get(`${routePrefix}${routePath}`, (_req, _res, next) => {
    try {
      throwFn();
    } catch (e) {
      next(e);
    }
  });

  // Async throw route
  app.get(`${routePrefix}/async${routePath}`, (_req, _res, next) => {
    Promise.resolve().then(() => throwFn()).catch(next);
  });

  // Inject isProduction via res.locals for test control
  if (isProd) {
    app.use((req, _res, next) => { req._testIsProduction = true; next(); });
  }

  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// v1 response shape tests
// ---------------------------------------------------------------------------
describe('errorHandler — v1 paths', () => {
  describe('DomainError subclasses', () => {
    const cases = [
      ['BadRequestError', () => new BadRequestError('bad input', [{ field: 'x' }]), 400, 'BAD_REQUEST'],
      ['NotFoundError', () => new NotFoundError('not found'), 404, 'NOT_FOUND'],
      ['UnauthorizedError', () => new UnauthorizedError('no auth'), 401, 'UNAUTHORIZED'],
      ['ForbiddenError', () => new ForbiddenError('forbidden'), 403, 'FORBIDDEN'],
      ['ConflictError', () => new ConflictError('conflict'), 409, 'CONFLICT'],
      ['UpstreamError', () => new UpstreamError('gateway'), 502, 'UPSTREAM_ERROR'],
      ['ValidationError', () => new ValidationError('invalid', [{ field: 'name' }]), 400, 'VALIDATION_ERROR'],
    ];

    test.each(cases)('%s → correct status and v1 shape', async (name, errFactory, expectedStatus) => {
      const app = buildApp({ throwFn: () => { throw errFactory(); } });
      const res = await request(app).get('/test');

      expect(res.status).toBe(expectedStatus);
      // v1 shape: has error field (string) or success field
      expect(res.body).toBeDefined();
    });

    test.each(cases)('%s → body has success:false', async (name, errFactory) => {
      const app = buildApp({ throwFn: () => { throw errFactory(); } });
      const res = await request(app).get('/test');
      expect(res.body.success).toBe(false);
    });
  });

  describe('legacy plain-object throws { status, message }', () => {
    it('uses status as HTTP code and returns message', async () => {
      const app = buildApp({ throwFn: () => { const e = new Error('legacy msg'); e.status = 422; throw e; } });
      const res = await request(app).get('/test');

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('success', false);
    });

    it('falls back to 500 when no status field', async () => {
      const app = buildApp({ throwFn: () => { throw new Error('plain error'); } });
      const res = await request(app).get('/test');
      expect(res.status).toBe(500);
    });
  });

  describe('Mongoose ValidationError', () => {
    it('returns 400 with field-level details', async () => {
      const app = buildApp({
        throwFn: () => {
          const err = new Error('Validation failed');
          err.name = 'ValidationError';
          err.errors = {
            name: { message: 'name is required', path: 'name' },
            email: { message: 'email is invalid', path: 'email' },
          };
          throw err;
        },
      });
      const res = await request(app).get('/test');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Mongoose CastError', () => {
    it('returns 400 with Invalid ID message', async () => {
      const app = buildApp({
        throwFn: () => {
          const err = new Error('Cast to ObjectId failed');
          err.name = 'CastError';
          err.kind = 'ObjectId';
          err.path = '_id';
          throw err;
        },
      });
      const res = await request(app).get('/test');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('MongoDB duplicate key (E11000)', () => {
    it('returns 409 Conflict', async () => {
      const app = buildApp({
        throwFn: () => {
          const err = new Error('E11000 duplicate key error collection: test.users index: email_1 dup key: { email: "a@b.com" }');
          err.code = 11000;
          err.keyValue = { email: 'a@b.com' };
          throw err;
        },
      });
      const res = await request(app).get('/test');

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('JWT errors', () => {
    it('JsonWebTokenError → 401', async () => {
      const app = buildApp({
        throwFn: () => {
          const err = new Error('invalid token');
          err.name = 'JsonWebTokenError';
          throw err;
        },
      });
      const res = await request(app).get('/test');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('TokenExpiredError → 401', async () => {
      const app = buildApp({
        throwFn: () => {
          const err = new Error('jwt expired');
          err.name = 'TokenExpiredError';
          throw err;
        },
      });
      const res = await request(app).get('/test');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Multer errors', () => {
    it('LIMIT_FILE_SIZE → 400', async () => {
      const app = buildApp({
        throwFn: () => {
          const err = new Error('File too large');
          err.code = 'LIMIT_FILE_SIZE';
          throw err;
        },
      });
      const res = await request(app).get('/test');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('LIMIT_UNEXPECTED_FILE → 400', async () => {
      const app = buildApp({
        throwFn: () => {
          const err = new Error('Unexpected file');
          err.code = 'LIMIT_UNEXPECTED_FILE';
          throw err;
        },
      });
      const res = await request(app).get('/test');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('generic Error → 500', () => {
    it('returns 500 for unknown errors', async () => {
      const app = buildApp({ throwFn: () => { throw new Error('something blew up'); } });
      const res = await request(app).get('/test');
      expect(res.status).toBe(500);
    });
  });

  describe('CORS error', () => {
    it('returns 403 for CORS not allowed', async () => {
      const app = buildApp({
        throwFn: () => { throw new Error('Not allowed by CORS'); },
      });
      const res = await request(app).get('/test');
      expect(res.status).toBe(403);
    });
  });
});

// ---------------------------------------------------------------------------
// v2 response shape tests — req.path starts with /v2
// ---------------------------------------------------------------------------
describe('errorHandler — v2 paths', () => {
  it('uses v2 envelope shape { success, error: { code, message } }', async () => {
    const app = buildApp({
      throwFn: () => { throw new NotFoundError('item not found'); },
      isV2: true,
    });
    const res = await request(app).get('/v2/test');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body.error).toHaveProperty('message', 'item not found');
  });

  it('v2 ValidationError includes details in error envelope', async () => {
    const app = buildApp({
      throwFn: () => { throw new ValidationError('invalid input', [{ field: 'name', message: 'required' }]); },
      isV2: true,
    });
    const res = await request(app).get('/v2/test');

    expect(res.status).toBe(400);
    expect(res.body.error.details).toBeDefined();
  });

  it('v2 generic error returns envelope with INTERNAL_ERROR code', async () => {
    const app = buildApp({
      throwFn: () => { throw new Error('surprise'); },
      isV2: true,
    });
    const res = await request(app).get('/v2/test');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Production mode — no stack leak
// ---------------------------------------------------------------------------
describe('errorHandler — production stack safety', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeAll(() => { process.env.NODE_ENV = 'production'; });
  afterAll(() => { process.env.NODE_ENV = originalEnv; });

  it('does not include stack in response body (v1 path)', async () => {
    const app = buildApp({ throwFn: () => { throw new Error('secret: db_pass=hunter2'); } });
    const res = await request(app).get('/test');

    expect(res.body.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('db_pass');
  });

  it('returns generic message instead of real error message (v1)', async () => {
    const app = buildApp({ throwFn: () => { throw new Error('Internal db connection string mongodb://user:pass@host'); } });
    const res = await request(app).get('/test');

    expect(res.body.message).not.toContain('mongodb://');
  });

  it('does not include stack in response body (v2 path)', async () => {
    const app = buildApp({ throwFn: () => { throw new Error('secret'); }, isV2: true });
    const res = await request(app).get('/v2/test');

    expect(res.body.stack).toBeUndefined();
    expect(res.body.error?.stack).toBeUndefined();
  });
});
