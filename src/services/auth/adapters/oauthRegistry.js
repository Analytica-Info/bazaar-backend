'use strict';

/**
 * oauthRegistry.js — Strategy registry for OAuth providers.
 *
 * Adding a new provider is a drop-in operation (<30 lines):
 *   1. Create adapters/fooVerifier.js implementing verifyToken(token, opts).
 *   2. Call registry.register('foo', require('./fooVerifier')) at module load.
 *   3. Pass provider: 'foo' from the controller.
 *
 * No use-case code changes required.
 */

const registry = new Map();

/**
 * Register an OAuth verifier under a provider name.
 *
 * @param {string} name - provider key (e.g. 'google', 'apple')
 * @param {{ verifyToken: Function }} verifier - must implement OAuthVerifier port
 */
function register(name, verifier) {
    if (!verifier || typeof verifier.verifyToken !== 'function') {
        throw new Error(`OAuthRegistry: verifier for "${name}" must implement verifyToken()`);
    }
    registry.set(name, verifier);
}

/**
 * Retrieve a registered verifier by provider name.
 *
 * @param {string} name
 * @returns {{ verifyToken: Function }}
 * @throws {{ status: 400, message: string }} on unknown provider
 */
function get(name) {
    const verifier = registry.get(name);
    if (!verifier) {
        throw { status: 400, message: `Unknown OAuth provider: ${name}` };
    }
    return verifier;
}

/**
 * List all registered provider names.
 *
 * @returns {string[]}
 */
function list() {
    return Array.from(registry.keys());
}

// Pre-register the real adapters at module load.
register('google', require('./googleVerifier'));
register('apple', require('./appleVerifier'));

module.exports = { register, get, list };
