'use strict';

const validate = require('../../src/middleware/validate');
const { mockReq, mockRes, mockNext } = require('./_helpers/mocks');
const { ValidationError } = require('../../src/services/_kernel/errors');

// Simple function-based schema: returns { ok, errors }
function emailSchema(input) {
  const errors = [];
  if (!input.email) errors.push({ field: 'email', message: 'email is required' });
  else if (!input.email.includes('@')) errors.push({ field: 'email', message: 'email is invalid' });
  return { ok: errors.length === 0, errors };
}

function ageSchema(input) {
  const errors = [];
  if (input.age === undefined || input.age === null) errors.push({ field: 'age', message: 'age is required' });
  else if (typeof input.age !== 'number' || input.age < 0) errors.push({ field: 'age', message: 'age must be a non-negative number' });
  return { ok: errors.length === 0, errors };
}

describe('validate middleware factory', () => {
  describe('with body source (default)', () => {
    it('calls next() without error when schema passes', () => {
      const mw = validate(emailSchema);
      const req = mockReq({ body: { email: 'user@example.com' } });
      const next = mockNext();

      mw(req, mockRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(); // no argument = no error
    });

    it('calls next(ValidationError) when schema fails', () => {
      const mw = validate(emailSchema);
      const req = mockReq({ body: { email: 'not-an-email' } });
      const next = mockNext();

      mw(req, mockRes(), next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.statusCode).toBe(400);
    });

    it('includes field-level details in ValidationError', () => {
      const mw = validate(emailSchema);
      const req = mockReq({ body: {} });
      const next = mockNext();

      mw(req, mockRes(), next);

      const err = next.mock.calls[0][0];
      expect(err.details).toBeDefined();
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details[0]).toHaveProperty('field', 'email');
    });

    it('handles missing body gracefully (treats as empty object)', () => {
      const mw = validate(emailSchema);
      const req = mockReq({}); // no body property
      const next = mockNext();

      mw(req, mockRes(), next);

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ValidationError);
    });
  });

  describe('with query source', () => {
    it('validates from req.query when source is "query"', () => {
      const mw = validate(emailSchema, 'query');
      const req = mockReq({ query: { email: 'valid@test.com' } });
      const next = mockNext();

      mw(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith();
    });

    it('returns ValidationError for invalid query params', () => {
      const mw = validate(ageSchema, 'query');
      const req = mockReq({ query: {} });
      const next = mockNext();

      mw(req, mockRes(), next);

      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ValidationError);
    });
  });

  describe('with params source', () => {
    it('validates from req.params when source is "params"', () => {
      const positiveId = (input) => ({
        ok: !!input.id,
        errors: input.id ? [] : [{ field: 'id', message: 'id is required' }],
      });
      const mw = validate(positiveId, 'params');
      const req = mockReq({ params: { id: '123' } });
      const next = mockNext();

      mw(req, mockRes(), next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('multiple validation errors', () => {
    function multiSchema(input) {
      const errors = [];
      if (!input.name) errors.push({ field: 'name', message: 'name is required' });
      if (!input.email) errors.push({ field: 'email', message: 'email is required' });
      return { ok: errors.length === 0, errors };
    }

    it('includes all field errors in details', () => {
      const mw = validate(multiSchema);
      const req = mockReq({ body: {} });
      const next = mockNext();

      mw(req, mockRes(), next);

      const err = next.mock.calls[0][0];
      expect(err.details).toHaveLength(2);
    });
  });
});
