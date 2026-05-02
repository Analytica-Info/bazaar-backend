'use strict';

const mongoose = require('mongoose');
const repos = require('../../../repositories');

exports.getUserReviews = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const orders = await repos.orders.findForUser(userId);

  if (orders.length === 0) {
    return { products: [] };
  }

  const orderIds = orders.map(order => order._id);
  const orderDetails = await repos.orderDetails.findForOrders(orderIds);

  const productIds = orderDetails.map(detail => detail.product_id);
  const productObjectIds = productIds.map(id => new mongoose.Types.ObjectId(id));

  const products = await repos.products.findByIdsForReviews(productObjectIds);
  const userReviews = await repos.reviews.findForUserByProducts(userObjectId, productObjectIds);

  const userReviewsByProduct = {};
  userReviews.forEach(review => {
    userReviewsByProduct[review.product_id.toString()] = review;
  });

  const orderDetailsByProduct = {};
  orderDetails.forEach(detail => {
    if (!orderDetailsByProduct[detail.product_id]) {
      orderDetailsByProduct[detail.product_id] = [];
    }
    orderDetailsByProduct[detail.product_id].push(detail);
  });

  const productsWithReviews = products.map(product => {
    const productId = product._id.toString();
    const userReview = userReviewsByProduct[productId] || null;
    const productOrderDetails = orderDetailsByProduct[productId] || [];

    const firstOrderDetail = productOrderDetails[0];
    const order = firstOrderDetail
      ? orders.find(o => o._id.toString() === firstOrderDetail.order_id.toString())
      : null;

    const orderData = order ? {
      _id: order._id,
      order_id: order.order_id,
      order_no: order.order_no,
      order_datetime: order.order_datetime,
      name: order.name,
      phone: order.phone,
      state: order.state,
      address: order.address,
      email: order.email,
      status: order.status,
      amount_subtotal: order.amount_subtotal,
      amount_total: order.amount_total,
      discount_amount: order.discount_amount,
      shipping: order.shipping,
      txn_id: order.txn_id,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      checkout_session_id: order.checkout_session_id,
      orderTracks: order.orderTracks,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    } : null;

    return {
      ...product,
      user_review: userReview,
      order_details: orderData,
    };
  });

  return { products: productsWithReviews };
};
