'use strict';

const Order = require('../../../repositories').orders.rawModel();
const OrderDetail = require('../../../repositories').orderDetails.rawModel();
const Product = require('../../../repositories').products.rawModel();
const { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } = require('../../../config/constants/pagination');

module.exports = async function getOrders(userId, { page = DEFAULT_PAGE, limit = DEFAULT_PAGE_SIZE } = {}) {
    const userFilter = { $or: [{ userId }, { user_id: userId }] };
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
        Order.find(userFilter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Order.countDocuments(userFilter),
    ]);

    const orderIds = orders.map(order => order._id);
    const orderDetails = orderIds.length
        ? await OrderDetail.find({ order_id: { $in: orderIds } })
        : [];

    const productIds = [...new Set(orderDetails.map(detail => detail.product_id))];

    const products = productIds.length
        ? await Product.find({ _id: { $in: productIds } }).select('product.id')
        : [];
    const productsMap = {};
    products.forEach(product => {
        productsMap[product._id.toString()] = product;
    });

    const detailsMap = {};
    orderDetails.forEach(detail => {
        const key = detail.order_id.toString();
        if (!detailsMap[key]) detailsMap[key] = [];

        const detailObj = detail.toObject();
        const product = productsMap[detail.product_id];

        if (product) {
            detailObj.ProductId = product.product?.id || null;
        }

        detailsMap[key].push(detailObj);
    });

    const ordersWithDetails = orders.map(order => {
        const orderObj = order.toObject();

        if (orderObj.userId) {
            orderObj.user_id = orderObj.userId;
            delete orderObj.userId;
        }

        if (orderObj.checkout_session_id) {
            orderObj.stripe_checkout_session_id = orderObj.checkout_session_id;
            delete orderObj.checkout_session_id;
        }

        orderObj.details = detailsMap[order._id.toString()] || [];
        return orderObj;
    });

    return { orders: ordersWithDetails, total, page, limit };
};
