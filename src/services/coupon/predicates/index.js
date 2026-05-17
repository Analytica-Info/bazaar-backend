'use strict';

/**
 * PredicateRegistry — open/closed extensibility seam.
 *
 * Each registered predicate is a function(rule, ctx) -> EligibilityVerdict.
 * Adding a new predicate = create the class + one register() call.
 */

/**
 * @typedef {'cheap'|'medium'|'expensive'} PredicateCost
 * @typedef {{ fn: function, cost: PredicateCost }} PredicateEntry
 */

/** @type {Map<string, PredicateEntry>} */
const registry = new Map();

/**
 * Register a predicate function for a rule type.
 *
 * @param {string} type - rule type key (e.g. 'min_subtotal')
 * @param {function(object, object): import('../domain/EligibilityVerdict')} fn
 * @param {{ cost?: PredicateCost }} [options]
 */
function register(type, fn, options = {}) {
  registry.set(type, { fn, cost: options.cost || 'medium' });
}

/**
 * Get a predicate function by type (backward-compatible).
 *
 * @param {string} type
 * @returns {function|undefined}
 */
function get(type) {
  const entry = registry.get(type);
  return entry ? entry.fn : undefined;
}

/**
 * Get full predicate entry including cost metadata.
 *
 * @param {string} type
 * @returns {PredicateEntry|undefined}
 */
function getEntry(type) {
  return registry.get(type);
}

module.exports = { register, get, getEntry };

// Auto-register all built-in predicates
require('./MinSubtotal');
require('./FirstOrder');
require('./UserSegment');
require('./CategoryIn');
require('./ProductIn');
require('./VerticalIn');
require('./Schedule');
require('./PaymentMethodIn');
require('./MaxQuantity');
require('./Geo');
require('./PlatformIn');
require('./GiftInStock');
