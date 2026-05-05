'use strict';

const repos = require('../../../repositories');

function mapPaymentMethod(method) {
  switch (method?.toLowerCase()) {
    case 'card':
    case 'stripe':
      return 'card';
    case 'tabby':
      return 'tabby';
    case 'cash':
      return 'cash';
    default:
      return 'card';
  }
}

function mapOrderStatus(status) {
  switch (status?.toLowerCase()) {
    case 'confirmed':
      return 'newOne';
    case 'packed':
      return 'packed';
    case 'on the way':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'newOne';
  }
}

exports.getTabbyBuyerHistory = async (userId, userCreatedAt) => {
  const recentOrders = await repos.orders.findRecentForTabbyHistory(userId, { limit: 10 });

  const orderIds = recentOrders.map(order => order._id);
  const orderDetails = await repos.orderDetails.findForOrders(orderIds);

  const detailsMap = {};
  orderDetails.forEach(detail => {
    const key = detail.order_id.toString();
    if (!detailsMap[key]) detailsMap[key] = [];
    detailsMap[key].push(detail);
  });

  const successfulOrders = await repos.orders.countSuccessfulOrders(userId);

  return {
    payment: {
      order_history: recentOrders.map(order => {
        const orderDetailsForOrder = detailsMap[order._id.toString()] || [];
        return {
          purchasedAt: order.createdAt.toISOString(),
          amount: order.amount_total,
          paymentMethod: mapPaymentMethod(order.payment_method),
          status: mapOrderStatus(order.status),
          buyer: {
            email: order.email,
            phone: order.phone,
            name: order.name,
          },
          items: orderDetailsForOrder.map(item => ({
            title: item.product_name,
            quantity: item.quantity,
            unitPrice: item.amount.toString(),
            category: item.variant_name || 'General',
          })),
          shippingAddress: {
            city: order.state || 'Unknown',
            address: order.address,
            zip: '00000',
          },
        };
      }),
      buyer_history: {
        registered_since: userCreatedAt,
        loyalty_level: successfulOrders,
      },
    },
  };
};
