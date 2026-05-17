'use strict';

const { makeContainer } = require('../../../src/services/_kernel/container');

const fakeRepos    = { orders: {}, users: {} };
const fakeClock    = { now: () => new Date(), nowMs: () => Date.now(), today: () => new Date() };
const fakeCache    = { get: jest.fn(), set: jest.fn(), del: jest.fn(), delPattern: jest.fn(), getOrSet: jest.fn() };
const fakeLogger   = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const fakeProviders = { create: jest.fn(), available: jest.fn() };

function makeValidDeps() {
  return { repos: fakeRepos, clock: fakeClock, cache: fakeCache, logger: fakeLogger, providers: fakeProviders };
}

describe('makeContainer', () => {
  it('returns an object with all five dependency keys', () => {
    const container = makeContainer(makeValidDeps());
    expect(container).toHaveProperty('repos');
    expect(container).toHaveProperty('clock');
    expect(container).toHaveProperty('cache');
    expect(container).toHaveProperty('logger');
    expect(container).toHaveProperty('providers');
  });

  it('passes dependencies through unchanged', () => {
    const container = makeContainer(makeValidDeps());
    expect(container.repos).toBe(fakeRepos);
    expect(container.clock).toBe(fakeClock);
    expect(container.cache).toBe(fakeCache);
    expect(container.logger).toBe(fakeLogger);
    expect(container.providers).toBe(fakeProviders);
  });

  it('returns a frozen object (immutable container)', () => {
    const container = makeContainer(makeValidDeps());
    expect(Object.isFrozen(container)).toBe(true);
  });

  it('throws if repos is missing', () => {
    const deps = makeValidDeps();
    delete deps.repos;
    expect(() => makeContainer(deps)).toThrow('repos is required');
  });

  it('throws if clock is missing', () => {
    const deps = makeValidDeps();
    delete deps.clock;
    expect(() => makeContainer(deps)).toThrow('clock is required');
  });

  it('throws if cache is missing', () => {
    const deps = makeValidDeps();
    delete deps.cache;
    expect(() => makeContainer(deps)).toThrow('cache is required');
  });

  it('throws if logger is missing', () => {
    const deps = makeValidDeps();
    delete deps.logger;
    expect(() => makeContainer(deps)).toThrow('logger is required');
  });

  it('throws if providers is missing', () => {
    const deps = makeValidDeps();
    delete deps.providers;
    expect(() => makeContainer(deps)).toThrow('providers is required');
  });

  it('is idempotent — two calls with the same deps produce equivalent containers', () => {
    const c1 = makeContainer(makeValidDeps());
    const c2 = makeContainer(makeValidDeps());
    expect(c1.repos).toBe(c2.repos);
    expect(c1.clock).toBe(c2.clock);
    expect(c1.cache).toBe(c2.cache);
  });

  it('produces independent containers on each call (no shared reference)', () => {
    const deps1 = makeValidDeps();
    const deps2 = { ...makeValidDeps(), repos: { products: {} } };
    const c1 = makeContainer(deps1);
    const c2 = makeContainer(deps2);
    expect(c1.repos).not.toBe(c2.repos);
  });
});
