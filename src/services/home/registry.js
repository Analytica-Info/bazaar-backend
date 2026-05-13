'use strict';

/**
 * RailRegistry — singleton that holds all home-manifest rail registrations.
 *
 * Usage:
 *   registry.register({ name, platforms, fetch, defaultParams, enabled })
 *   registry.resolve(name)          → registration | null
 *   registry.list({ platform })     → registrations[]
 */

/** @type {Map<string, object>} */
const _rails = new Map();

/**
 * Register a rail.
 * @param {object} opts
 * @param {string}   opts.name          - Stable rail identifier used in the manifest.
 * @param {string[]} opts.platforms      - Platforms that include this rail by default.
 * @param {function} opts.fetch          - async (ctx) => data
 * @param {object}   [opts.defaultParams]
 * @param {function} [opts.enabled]      - () => boolean — feature flag hook.
 */
function register({ name, platforms, fetch, defaultParams = {}, enabled = () => true }) {
  if (_rails.has(name)) {
    throw new Error(`Rail "${name}" is already registered`);
  }
  _rails.set(name, { name, platforms, fetch, defaultParams, enabled });
}

/**
 * @param {string} railName
 * @returns {object|null}
 */
function resolve(railName) {
  return _rails.get(railName) || null;
}

/**
 * @param {{ platform: string }} opts
 * @returns {object[]}
 */
function list({ platform }) {
  const result = [];
  for (const reg of _rails.values()) {
    if (reg.platforms.includes(platform) && reg.enabled()) {
      result.push(reg);
    }
  }
  return result;
}

/** Clear all registrations — used in tests only. */
function _reset() {
  _rails.clear();
}

module.exports = { register, resolve, list, _reset };
