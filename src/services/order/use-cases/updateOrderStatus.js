'use strict';

const Order = require('../../../repositories').orders.rawModel();
const clock = require('../../../utilities/clock');

module.exports = async function updateOrderStatus(orderId, status, filePath, requestingUserId = null) {
    if (!status) {
        throw { status: 400, message: "Status is required" };
    }

    const allowedStatuses = [
        "Packed",
        "On The Way",
        "Arrived At Facility",
        "Out For Delivery",
        "Delivered",
        "Confirmed"
    ];

    if (!allowedStatuses.includes(status)) {
        throw {
            status: 400,
            message: `Invalid status. Allowed statuses are: ${allowedStatuses.join(", ")}`
        };
    }

    const order = await Order.findById(orderId);
    if (!order) {
        throw { status: 404, message: "Order not found" };
    }

    if (requestingUserId) {
        const ownerId = String(order.userId || order.user_id || '');
        if (ownerId && ownerId !== String(requestingUserId)) {
            throw { status: 403, message: "Not authorized to update this order" };
        }
    }

    let imagePath = null;
    if (filePath) {
        imagePath = filePath.replace(/\\/g, "/");
        imagePath = `${process.env.FRONTEND_BASE_URL}/${imagePath}`;
    }

    order.status = status;

    order.orderTracks.push({
        status,
        dateTime: clock.now(),
        image: imagePath
    });

    await order.save();

    return order;
};
