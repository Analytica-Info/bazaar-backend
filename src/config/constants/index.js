'use strict';

/**
 * constants/index.js — barrel export for all named constants.
 *
 * Usage:
 *   const { MS_PER_DAY, STRIPE_AMOUNT_MULTIPLIER } = require('../config/constants');
 */

module.exports = {
  ...require('./time'),
  ...require('./money'),
  ...require('./pagination'),
  ...require('./business'),
};
