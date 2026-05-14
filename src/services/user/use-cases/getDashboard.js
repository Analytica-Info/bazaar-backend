'use strict';

const repos = require('../../../repositories');
const { populateOrdersWithDetails } = require('../domain/populateOrders');

exports.getDashboard = async (userId) => {
  const orders = await repos.orders.findForUser(userId);
  const updatedOrders = await populateOrdersWithDetails(orders);

  if (updatedOrders.length === 0) {
    throw { status: 404, message: 'No payment history found.' };
  }

  const totalOrders = updatedOrders.length;
  const totalSpent = updatedOrders.reduce((sum, order) => sum + parseFloat(order.amount_total || 0), 0);
  const formattedTotalSpent = Number(totalSpent.toFixed(2));
  const activeOrders = updatedOrders.filter((o) => o.status.toLowerCase() !== 'delivered').length;

  const wishlistItem = await repos.wishlists.countItemsForUser(userId);

  return {
    recent_orders: updatedOrders,
    total_spent: formattedTotalSpent,
    total_orders: totalOrders,
    active_orders: activeOrders,
    wishlist_item: wishlistItem,
  };
};
