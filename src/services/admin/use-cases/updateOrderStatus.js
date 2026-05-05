'use strict';

const Order = require('../../../repositories').orders.rawModel();
const { getUaeDateTime } = require('../domain/uaeClock');

const STATUS_SEQUENCE = ['Confirmed', 'Packed', 'Out For Delivery', 'Delivered', 'Refunded'];

module.exports = async function updateOrderStatus(orderId, status, filePath) {
    if (!status) throw { status: 400, message: 'Status is required' };

    if (!STATUS_SEQUENCE.includes(status)) {
        throw {
            status: 400,
            message: `Invalid status. Allowed statuses are: ${STATUS_SEQUENCE.join(', ')}`
        };
    }

    const order = await Order.findById(orderId);
    if (!order) throw { status: 404, message: 'Order not found' };

    let imagePath = null;
    if (filePath) {
        imagePath = filePath.replace(/\\/g, '/');
        imagePath = `${process.env.BACKEND_URL}/${imagePath}`;
    }

    const newStatusIndex    = STATUS_SEQUENCE.indexOf(status);
    const filteredTracks    = order.orderTracks.filter(track => {
        const trackStatusIndex = STATUS_SEQUENCE.indexOf(track.status);
        return trackStatusIndex < newStatusIndex;
    });

    filteredTracks.push({ status, dateTime: getUaeDateTime(), image: imagePath });

    const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status, orderTracks: filteredTracks },
        { new: true, runValidators: false }
    );

    return updatedOrder;
};
