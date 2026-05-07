'use strict';

/**
 * Dependency-injection container factory.
 *
 * `makeContainer` is a pure function — no singletons, no globals.
 * Pass in the real adapters for production; pass in fakes/mocks for tests.
 *
 * Services will be added in later PRs (PR-MOD-2 through PR-MOD-8).
 * For PR-MOD-1, the container only surfaces the infrastructure dependencies.
 *
 * @param {object} deps
 * @param {object} deps.repos      - Repository registry (from src/repositories/index.js)
 * @param {import('./ports').Clock}  deps.clock     - Clock adapter
 * @param {import('./ports').Cache}  deps.cache     - Cache adapter
 * @param {import('./ports').Logger} deps.logger    - Logger adapter
 * @param {object} deps.providers  - Payment providers map (e.g. { stripe, tabby, nomod })
 * @returns {Readonly<{repos: object, clock: object, cache: object, logger: object, providers: object}>}
 */
function makeContainer({ repos, clock, cache, logger, providers }) {
  if (!repos)    throw new Error('makeContainer: repos is required');
  if (!clock)    throw new Error('makeContainer: clock is required');
  if (!cache)    throw new Error('makeContainer: cache is required');
  if (!logger)   throw new Error('makeContainer: logger is required');
  if (!providers) throw new Error('makeContainer: providers is required');

  return Object.freeze({ repos, clock, cache, logger, providers });
}

module.exports = { makeContainer };
