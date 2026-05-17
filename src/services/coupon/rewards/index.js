'use strict';

/**
 * RewardRegistry — open/closed extensibility seam for reward types.
 *
 * Each registered value is a RewardClass with static apply(rewardConfig, cart) method.
 * Adding a new reward = create the class + one register() call.
 */

/** @type {Map<string, object>} */
const registry = new Map();

/**
 * Register a reward class for a reward type.
 *
 * @param {string} type - reward type key (e.g. 'flat')
 * @param {{ apply: function }} RewardClass
 */
function register(type, RewardClass) {
  registry.set(type, RewardClass);
}

/**
 * Get a reward class by type.
 *
 * @param {string} type
 * @returns {{ apply: function }|undefined}
 */
function get(type) {
  return registry.get(type);
}

module.exports = { register, get };

// Auto-register all built-in rewards
require('./FlatReward');
require('./PercentReward');
require('./FreeShippingReward');
require('./TieredPercentReward');
require('./BxGyReward');
require('./FreeGiftReward');
