'use strict';

/**
 * Bootstrap — wires real adapters into a singleton container.
 *
 * This module is required once at application startup.
 * All facades that need the container do:
 *
 *   const container = require('./_kernel/bootstrap');
 *
 * The module is safe to require from anywhere; it does not import any
 * existing service file, avoiding circular dependency risk.
 */

const repos = require('../../repositories');
const clock = require('../../utilities/clock');
const logger = require('../../utilities/logger');
const { makeRedisCache } = require('./cache');
const { makeContainer } = require('./container');
const PaymentProviderFactory = require('../payments/PaymentProviderFactory');

// Build the cache adapter wrapping the legacy Redis-backed utility.
// The legacy module manages its own Redis client internally.
const cache = makeRedisCache(null, { logger, defaultTtlSeconds: 300 });

// Build a map of the available payment providers.
// Providers are instantiated lazily per-request in normal usage, but the
// bootstrap exposes the factory so use-cases can resolve providers by name.
const providers = {
  factory: PaymentProviderFactory,
  /**
   * Resolve a provider by name (delegates to factory).
   * @param {string} [name]
   * @returns {import('../payments/PaymentProvider')}
   */
  create(name) {
    return PaymentProviderFactory.create(name);
  },
  /** List available provider names. */
  available() {
    return PaymentProviderFactory.available();
  },
};

const container = makeContainer({ repos, clock, cache, logger, providers });

module.exports = container;
