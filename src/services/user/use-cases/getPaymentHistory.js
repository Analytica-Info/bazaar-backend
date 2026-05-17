'use strict';

const repos = require('../../../repositories');
const { populateOrdersWithDetails } = require('../domain/populateOrders');

exports.getPaymentHistory = async (userId) => {
  const orders = await repos.orders.findForUser(userId);
  const updatedOrders = await populateOrdersWithDetails(orders);

  if (updatedOrders.length === 0) {
    throw { status: 404, message: 'No payment history found.' };
  }

  return { history: updatedOrders };
};

exports.getSinglePaymentHistory = async (userId, paymentId) => {
  const orders = await repos.orders.findOneForUser(userId, paymentId);
  const updatedOrders = await populateOrdersWithDetails(orders, { includeSku: false });

  if (updatedOrders.length === 0) {
    throw { status: 404, message: 'No payment history found.' };
  }

  return { history: updatedOrders };
};
