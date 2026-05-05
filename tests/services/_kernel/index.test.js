'use strict';

/**
 * Smoke test for the kernel barrel (index.js) and ports.js documentation artifact.
 * Ensures that requiring the barrel returns all expected exports without errors.
 */

// Set a dummy Stripe key before any require that transitively loads StripeProvider.
// StripeProvider calls require('stripe')(process.env.STRIPE_SK) at module load time.
process.env.STRIPE_SK = process.env.STRIPE_SK || 'sk_test_dummy';

describe('_kernel/index barrel', () => {
  let kernel;

  beforeAll(() => {
    kernel = require('../../../src/services/_kernel/index');
  });

  it('loads without throwing', () => {
    expect(kernel).toBeDefined();
  });

  it('re-exports error classes', () => {
    const errorClasses = [
      'DomainError', 'BadRequestError', 'NotFoundError', 'UnauthorizedError',
      'ForbiddenError', 'ConflictError', 'UpstreamError', 'ValidationError',
    ];
    for (const name of errorClasses) {
      expect(typeof kernel[name]).toBe('function');
    }
  });

  it('re-exports isDomainError and toEnvelope helpers', () => {
    expect(typeof kernel.isDomainError).toBe('function');
    expect(typeof kernel.toEnvelope).toBe('function');
  });

  it('re-exports makeRedisCache and makeNullCache', () => {
    expect(typeof kernel.makeRedisCache).toBe('function');
    expect(typeof kernel.makeNullCache).toBe('function');
  });

  it('re-exports makeContainer', () => {
    expect(typeof kernel.makeContainer).toBe('function');
  });

  it('re-exports bootstrap singleton', () => {
    expect(kernel.bootstrap).toBeDefined();
    expect(typeof kernel.bootstrap).toBe('object');
    expect(Object.isFrozen(kernel.bootstrap)).toBe(true);
  });

  it('re-exports ports as an object', () => {
    expect(typeof kernel.ports).toBe('object');
  });
});

describe('_kernel/ports documentation artifact', () => {
  it('exports an empty object at runtime', () => {
    const ports = require('../../../src/services/_kernel/ports');
    expect(ports).toBeDefined();
    expect(typeof ports).toBe('object');
    expect(Object.keys(ports)).toHaveLength(0);
  });
});
