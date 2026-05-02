'use strict';

const Cart = require('../../../repositories').carts.rawModel();
const Product = require('../../../repositories').products.rawModel();

/**
 * Add item to cart.
 */
async function addToCart(userId, itemData, options = {}) {
  const { validateVariantQty = false } = options;
  const {
    product_id,
    product_type_id,
    qty,
    p_image,
    p_name,
    p_originalPrice,
    p_id,
    p_totalAvailableQty,
    variantId,
    variantName,
    variantPrice,
  } = itemData;

  if (!product_id) throw { status: 400, message: 'product_id is required' };
  const quantity = Number(qty) || 1;
  if (quantity < 1) throw { status: 400, message: 'Valid quantity is required' };

  const product = await Product.findOne({
    _id: product_id,
    $or: [{ status: { $exists: false } }, { status: true }],
  });

  if (!product) throw { status: 404, message: 'Product not found or not available' };

  if (!product.totalQty || product.totalQty < quantity) {
    throw {
      status: 400,
      message: `Insufficient quantity available. Only ${product.totalQty || 0} items available.`,
    };
  }

  if (validateVariantQty && p_totalAvailableQty && quantity > p_totalAvailableQty) {
    throw {
      status: 400,
      message: `Cannot add more than ${p_totalAvailableQty} items for this product.`,
    };
  }

  let cart = await Cart.findOne({ user: userId }).read('primary');

  const newItem = {
    product: product_id,
    product_type_id,
    quantity,
    image: p_image,
    name: p_name,
    originalPrice: p_originalPrice,
    productId: p_id,
    totalAvailableQty: p_totalAvailableQty,
    variantId,
    variantName,
    variantPrice,
  };

  if (!cart) {
    cart = new Cart({ user: userId, items: [newItem] });
  } else {
    const existing = cart.items.find(
      (i) => i.product.toString() === product_id && i.variantId === variantId
    );

    if (existing) {
      const newTotalQty = existing.quantity + quantity;
      if (newTotalQty > product.totalQty) {
        const remaining = product.totalQty - existing.quantity;
        throw {
          status: 400,
          message:
            remaining <= 0
              ? `You have reached the maximum available quantity of ${product.totalQty}.`
              : `Only ${remaining} more items left in stock.`,
          cartCount: cart.items.length,
          cart: cart.items,
        };
      }

      if (validateVariantQty && p_totalAvailableQty && newTotalQty > p_totalAvailableQty) {
        const remaining = p_totalAvailableQty - existing.quantity;
        throw {
          status: 400,
          message:
            remaining <= 0
              ? `You have reached the maximum available quantity of ${p_totalAvailableQty}.`
              : `Only ${remaining} more items left in stock.`,
        };
      }

      existing.quantity = newTotalQty;
    } else {
      cart.items.push(newItem);
    }
  }

  await cart.save();
  return { cartCount: cart.items.length, cart: cart.items };
}

/**
 * Remove item from cart.
 */
async function removeFromCart(userId, productId) {
  if (!productId) throw { status: 400, message: 'product_id is required' };

  const cart = await Cart.findOne({ user: userId }).read('primary');
  if (!cart) throw { status: 404, message: 'Cart not found' };

  const originalLength = cart.items.length;
  cart.items = cart.items.filter((item) => item.product.toString() !== productId);

  if (cart.items.length === originalLength) {
    throw { status: 404, message: 'Product not found in cart' };
  }

  await cart.save();
  return { cartCount: cart.items.length, cart: cart.items };
}

/**
 * Increase item quantity.
 */
async function increaseQty(userId, productId, qty, options = {}) {
  const { validateAvailableQty = false } = options;

  if (!productId || !qty || qty < 1)
    throw { status: 400, message: 'product_id and valid qty are required' };

  const cart = await Cart.findOne({ user: userId }).read('primary');
  const item = cart?.items.find((i) => i.product.toString() === productId);
  if (!item) throw { status: 404, message: 'Product not found in cart' };

  if (validateAvailableQty) {
    const totalAvailableQty = item.totalAvailableQty || 0;
    if (item.quantity + qty > totalAvailableQty) {
      throw {
        status: 400,
        message: `Cannot increase quantity. Maximum available quantity is ${totalAvailableQty}.`,
      };
    }
  }

  item.quantity += qty;
  await cart.save();
  return { cart: cart.items };
}

/**
 * Decrease item quantity.
 */
async function decreaseQty(userId, productId, qty) {
  if (!productId || !qty || qty < 1)
    throw { status: 400, message: 'product_id and valid qty are required' };

  const cart = await Cart.findOne({ user: userId }).read('primary');
  const item = cart?.items.find((i) => i.product.toString() === productId);
  if (!item) throw { status: 404, message: 'Product not found in cart' };

  let message;
  if (item.quantity > qty) {
    item.quantity -= qty;
    message = `Quantity decreased by ${qty}`;
  } else {
    cart.items = cart.items.filter((i) => i.product.toString() !== productId);
    message = 'Product removed from cart';
  }

  await cart.save();
  return { cart: cart.items, message };
}

module.exports = { addToCart, removeFromCart, increaseQty, decreaseQty };
