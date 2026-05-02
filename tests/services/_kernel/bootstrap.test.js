'use strict';

/**
 * bootstrap.test.js — sanity-checks that the singleton container wired by
 * bootstrap.js exposes the expected dependency keys.
 *
 * We do NOT spin up MongoDB or Redis here.  The test simply verifies that the
 * module loads without error and that the shape of the container is correct.
 * The underlying repository constructors are safe to instantiate without a DB
 * connection (they are lazy; they only hit Mongo when a method is called).
 */

// Require the bootstrap singleton
let container;

beforeAll(() => {
  // bootstrap imports PaymentProviderFactory which imports StripeProvider
  // which calls `require('stripe')(process.env.STRIPE_SK)` at module load.
  // Set a dummy key so the stripe constructor doesn't throw.
  process.env.STRIPE_SK = process.env.STRIPE_SK || 'sk_test_dummy';

  container = require('../../../src/services/_kernel/bootstrap');
});

describe('bootstrap container', () => {
  it('loads without throwing', () => {
    expect(container).toBeDefined();
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(container)).toBe(true);
  });

  it('exposes repos', () => {
    expect(container.repos).toBeDefined();
    expect(typeof container.repos).toBe('object');
  });

  it('repos includes known repository keys', () => {
    // Spot-check a handful of expected keys from repositories/index.js
    expect(container.repos).toHaveProperty('orders');
    expect(container.repos).toHaveProperty('users');
    expect(container.repos).toHaveProperty('products');
    expect(container.repos).toHaveProperty('carts');
  });

  it('exposes clock with now/nowMs/today', () => {
    expect(typeof container.clock.now).toBe('function');
    expect(typeof container.clock.nowMs).toBe('function');
    expect(typeof container.clock.today).toBe('function');
  });

  it('clock.now() returns a Date', () => {
    expect(container.clock.now()).toBeInstanceOf(Date);
  });

  it('clock.nowMs() returns a number', () => {
    expect(typeof container.clock.nowMs()).toBe('number');
  });

  it('exposes cache with the five required methods', () => {
    expect(typeof container.cache.get).toBe('function');
    expect(typeof container.cache.set).toBe('function');
    expect(typeof container.cache.del).toBe('function');
    expect(typeof container.cache.delPattern).toBe('function');
    expect(typeof container.cache.getOrSet).toBe('function');
  });

  it('exposes logger with info/warn/error/debug', () => {
    expect(typeof container.logger.info).toBe('function');
    expect(typeof container.logger.warn).toBe('function');
    expect(typeof container.logger.error).toBe('function');
    expect(typeof container.logger.debug).toBe('function');
  });

  it('exposes providers with create and available', () => {
    expect(typeof container.providers.create).toBe('function');
    expect(typeof container.providers.available).toBe('function');
  });

  it('providers.available() returns an array of strings', () => {
    const available = container.providers.available();
    expect(Array.isArray(available)).toBe(true);
    expect(available.length).toBeGreaterThan(0);
    available.forEach(name => expect(typeof name).toBe('string'));
  });

  it('providers.create("stripe") returns a provider with createCheckout', () => {
    const provider = container.providers.create('stripe');
    expect(typeof provider.createCheckout).toBe('function');
  });

  it('is a singleton — repeated requires return the same object', () => {
    const again = require('../../../src/services/_kernel/bootstrap');
    expect(again).toBe(container);
  });
});
