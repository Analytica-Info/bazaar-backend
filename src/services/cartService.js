'use strict';

// ---------------------------------------------------------------------------
// Thin facade — all logic lives in src/services/cart/use-cases/ and domain/
// ---------------------------------------------------------------------------

const { getCart } = require('./cart/use-cases/getCart');
const { addToCart, removeFromCart, increaseQty, decreaseQty } = require('./cart/use-cases/modifyCart');
const { getCategoryNameById } = require('./cart/domain/categoryMap');
const { getGiftProductInfo } = require('./cart/domain/giftProduct');

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
  increaseQty,
  decreaseQty,
  getCategoryNameById,
  getGiftProductInfo,
};
