'use strict';

/**
 * domain/cartHelpers.js
 *
 * Cart utility helpers extracted from checkoutService (PR-MOD-4).
 */

const repositories = require('../../../repositories');
const Cart = repositories.carts.rawModel();

const logger = require('../../../utilities/logger');
const clock = require('../../../utilities/clock');

/**
 * Clear all items from a user's cart.
 * Errors are swallowed (non-fatal).
 * @param {string} user_id
 */
async function clearUserCart(user_id) {
  try {
    const cart = await Cart.findOne({ user: user_id }).read('primary');
    if (cart) {
      cart.items = [];
      await cart.save();
      logger.info(`Cart cleared for user: ${user_id}`);
    }
  } catch (err) {
    logger.error({ err }, 'Error clearing cart:');
  }
}

/**
 * Return an ISO-8601 datetime string in Asia/Dubai (+04:00) timezone.
 * Uses clock.now() so tests can freeze time.
 * @returns {string}
 */
function getUaeDateTime() {
  const now = clock.now();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const yr = parseInt(parts.find((p) => p.type === 'year').value);
  const month = parseInt(parts.find((p) => p.type === 'month').value) - 1;
  const day = parseInt(parts.find((p) => p.type === 'day').value);
  const hour = parseInt(parts.find((p) => p.type === 'hour').value);
  const minute = parseInt(parts.find((p) => p.type === 'minute').value);
  const second = parseInt(parts.find((p) => p.type === 'second').value);
  const milliseconds = now.getMilliseconds();

  return `${yr}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}+04:00`;
}

module.exports = {
  clearUserCart,
  getUaeDateTime,
};
