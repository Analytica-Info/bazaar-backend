'use strict';

const mongoose = require('mongoose');
const OrderDetail = require('../../../repositories').orderDetails.rawModel();
const Product     = require('../../../repositories').products.rawModel();

/**
 * Batch-fetch order details and product SKUs for a list of orders.
 * Replaces the N+1 pattern (1 OrderDetail + 1 Product query per order)
 * with 2 queries total regardless of order count.
 *
 * @param {Array} orders - Mongoose order documents (or plain objects with _id)
 * @returns {Promise<Array>} Orders as plain objects with order_details array attached
 */
async function enrichOrdersWithDetails(orders) {
    if (!orders.length) return [];

    const orderIds = orders.map(o => new mongoose.Types.ObjectId(o._id));

    const allDetails = await OrderDetail.find({ order_id: { $in: orderIds } }).lean().exec();

    const allProductIds = [...new Set(
        allDetails.map(d => d.product_id).filter(Boolean)
    )].map(id => new mongoose.Types.ObjectId(id));

    const products = await Product.find({ _id: { $in: allProductIds } })
        .select('product.sku_number')
        .lean()
        .exec();

    const skuMap = Object.fromEntries(products.map(p => [p._id.toString(), p.product?.sku_number || null]));

    const detailsByOrderId = {};
    for (const detail of allDetails) {
        const key = detail.order_id.toString();
        if (!detailsByOrderId[key]) detailsByOrderId[key] = [];
        detailsByOrderId[key].push({ ...detail, sku: skuMap[detail.product_id?.toString()] || null });
    }

    return orders.map(order => {
        const orderObj = typeof order.toObject === 'function' ? order.toObject() : order;
        return { ...orderObj, order_details: detailsByOrderId[order._id.toString()] || [] };
    });
}

module.exports = { enrichOrdersWithDetails };
