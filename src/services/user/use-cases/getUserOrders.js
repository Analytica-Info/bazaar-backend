'use strict';

const repos = require('../../../repositories');
const { populateOrdersWithDetails } = require('../domain/populateOrders');

exports.getUserOrders = async (userId, opts) => {
  const orders = await repos.orders.findForUser(userId, opts);
  const updatedOrders = await populateOrdersWithDetails(orders);

  if (updatedOrders.length === 0) {
    throw { status: 404, message: 'No orders found.' };
  }

  const totalOrders = updatedOrders.length;
  const shippedOrders = updatedOrders.filter((o) => o.status.toLowerCase() === 'shipped').length;
  const deliveredOrders = updatedOrders.filter((o) => o.status.toLowerCase() === 'delivered').length;
  const canceledOrders = updatedOrders.filter((o) => o.status.toLowerCase() === 'canceled').length;

  return {
    orders: updatedOrders,
    total_orders: totalOrders,
    shipped_orders: shippedOrders,
    delivered_orders: deliveredOrders,
    canceled_orders: canceledOrders,
  };
};

exports.getOrder = async (userId, orderId) => {
  const orders = await repos.orders.findOneForUser(userId, orderId);
  const updatedOrders = await populateOrdersWithDetails(orders, { includeSku: false });

  if (updatedOrders.length === 0) {
    throw { status: 404, message: 'No orders found.' };
  }

  return { orders: updatedOrders };
};
