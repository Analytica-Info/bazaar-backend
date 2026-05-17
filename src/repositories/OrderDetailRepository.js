const OrderDetail = require('../models/OrderDetail');
const BaseRepository = require('./BaseRepository');

class OrderDetailRepository extends BaseRepository {
    constructor() {
        super(OrderDetail);
    }

    /** Lean fetch of all details for a list of orders. */
    findForOrders(orderIds) {
        return this.model.find({ order_id: { $in: orderIds } }).lean().exec();
    }
}

module.exports = OrderDetailRepository;
