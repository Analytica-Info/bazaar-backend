'use strict';

/**
 * passwordHasher.js — pure bcrypt wrapper.
 *
 * No I/O beyond bcrypt operations. Wraps bcryptjs so
 * tests can mock at this boundary instead of mocking the lib directly.
 */

const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 10;

/**
 * Hash a plain-text password.
 *
 * @param {string} password
 * @returns {Promise<string>} hashed password
 */
async function hash(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain-text password against a stored hash.
 *
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
async function compare(password, storedHash) {
    return bcrypt.compare(password, storedHash);
}

module.exports = { hash, compare };
