'use strict';

const mongoose = require('mongoose');
const repos = require('../../../repositories');

/**
 * For a list of orders, populate each with its order details + SKU info.
 * Two queries total — all OrderDetails + all Products in $in batch (no N+1).
 */
async function populateOrdersWithDetails(orders, { includeSku = true } = {}) {
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => new mongoose.Types.ObjectId(o._id));
  const allOrderDetails = await repos.orderDetails.findForOrders(orderIds);

  const detailsByOrderId = {};
  for (const d of allOrderDetails) {
    const k = String(d.order_id);
    if (!detailsByOrderId[k]) detailsByOrderId[k] = [];
    detailsByOrderId[k].push(d);
  }

  let productSkuMap = {};
  if (includeSku) {
    const productIds = [
      ...new Set(
        allOrderDetails
          .map((d) => d.product_id)
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ].map((id) => new mongoose.Types.ObjectId(id));

    productSkuMap = await repos.products.findSkuMap(productIds);
  }

  return orders.map((order) => {
    const details = detailsByOrderId[String(order._id)] || [];
    const finalDetails = includeSku
      ? details.map((d) => ({
          ...d,
          sku: productSkuMap[String(d.product_id)] || null,
        }))
      : details;
    return {
      ...(typeof order.toObject === 'function' ? order.toObject() : order),
      order_details: finalDetails,
    };
  });
}

module.exports = { populateOrdersWithDetails };
