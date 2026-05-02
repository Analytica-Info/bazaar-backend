'use strict';

/**
 * Kernel barrel — re-exports all public kernel surfaces.
 *
 * Usage:
 *   const { NotFoundError, makeNullCache, makeContainer } = require('./_kernel');
 */

const errors = require('./errors');
const ports = require('./ports');
const cache = require('./cache');
const { makeContainer } = require('./container');
const bootstrap = require('./bootstrap');

module.exports = {
  ...errors,
  ports,
  ...cache,
  makeContainer,
  bootstrap,
};
