'use strict';

/**
 * use-cases/processCheckout.js
 *
 * Legacy /checkout endpoint handler. Extracted from checkoutService (PR-MOD-4).
 * BUG-002 fix already applied (preserved verbatim).
 *
 * BUG-010: STRIPE_SK read at module load time (preserved).
 */

const stripe = require('stripe')(process.env.STRIPE_SK);

const repositories = require('../../../repositories');
const Order = repositories.orders.rawModel();
const OrderDetail = repositories.orderDetails.rawModel();

/**
 * @param {object} orderData
 * @param {string} userId
 */
async function processCheckout(orderData, userId) {
  try {
    const { name, email, address, cartData, shippingCost, currency } = orderData;

    const amount =
      cartData.reduce((total, item) => total + item.price * item.qty, 0) +
      shippingCost;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency || 'usd',
      payment_method_types: ['card'],
    });

    const order = await Order.create({
      name, email, address, amount, shipping: shippingCost,
      payment_status: 'pending',
      stripe_checkout_session_id: paymentIntent.id,
      orderfrom: 'Website',
      txn_id: paymentIntent.id,
      status: 'pending',
      amount_subtotal: (amount - shippingCost).toFixed(2),
      amount_total: amount.toFixed(2),
      discount_amount: '0',
      payment_method: 'stripe',
    });

    const orderDetails = cartData.map((item) => ({
      order_id: order._id, product_id: item.id, product_name: item.name,
      variant_name: item.variant, amount: item.price, quantity: item.qty,
    }));

    await OrderDetail.insertMany(orderDetails);

    return { message: 'Order created successfully', orderId: order._id };
  } catch (error) {
    console.error(error);
    throw { status: 500, message: error.message };
  }
}

module.exports = processCheckout;
