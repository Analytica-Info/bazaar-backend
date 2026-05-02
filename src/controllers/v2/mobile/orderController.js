/**
 * V2 Mobile Order Controller (BFF layer)
 */
const orderService = require('../../../services/orderService');
const { wrap, paginated } = require('../_shared/responseEnvelope');
const { toDomainError } = require('../_shared/errors');
const { asyncHandler } = require('../../../middleware');
const { BadRequestError } = require('../../../services/_kernel/errors');
const logger = require('../../../utilities/logger');

exports.getOrders = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const result = await orderService.getOrders(userId, { page, limit });
        return res.status(200).json(paginated(result.orders, result.total, result.page, result.limit));
    } catch (e) { throw toDomainError(e); }
});

exports.validateInventory = asyncHandler(async (req, res) => {
    try {
        const { products } = req.body;
        const result = await orderService.validateInventoryBeforeCheckout(products, req.user, 'Mobile App Backend');
        return res.status(200).json(wrap({ isValid: result.isValid, results: result.results }, result.message));
    } catch (e) { throw toDomainError(e); }
});

exports.checkoutStripe = asyncHandler(async (req, res) => {
    try {
        const result = await orderService.createStripeCheckoutSession(req.user._id, req.body, { fcmToken: req.user?.fcmToken || null });
        return res.status(200).json(wrap({ orderId: result.orderId }, result.message));
    } catch (e) { throw toDomainError(e); }
});

exports.checkoutTabby = asyncHandler(async (req, res) => {
    try {
        const result = await orderService.createTabbyCheckoutSession(req.user._id, req.body, { fcmToken: req.user?.fcmToken || null });
        return res.status(200).json(wrap({ paymentId: result.paymentId, status: result.status }, result.message));
    } catch (e) { throw toDomainError(e); }
});

exports.verifyTabby = asyncHandler(async (req, res) => {
    try {
        const result = await orderService.verifyTabbyPayment(req.query.paymentId, req.user._id);
        return res.status(200).json(wrap({ finalStatus: result.finalStatus || null }, result.message));
    } catch (e) { throw toDomainError(e); }
});

exports.checkoutNomod = asyncHandler(async (req, res) => {
    try {
        const result = await orderService.createNomodCheckoutSession(req.user._id, req.body, { fcmToken: req.user?.fcmToken || null });
        return res.status(200).json(wrap({ paymentId: result.paymentId, status: result.status }, result.message));
    } catch (e) { throw toDomainError(e); }
});

exports.verifyNomod = asyncHandler(async (req, res) => {
    try {
        const result = await orderService.verifyNomodPayment(req.query.paymentId, req.user._id);
        return res.status(200).json(wrap({ finalStatus: result.finalStatus || null }, result.message));
    } catch (e) { throw toDomainError(e); }
});

exports.initStripePayment = asyncHandler(async (req, res) => {
    const { amountAED } = req.body;
    if (!amountAED || isNaN(amountAED) || Number(amountAED) <= 0) {
        throw new BadRequestError('amountAED is required and must be a positive number');
    }
    try {
        const result = await orderService.initStripePayment(req.user._id, Number(amountAED));
        return res.status(200).json(wrap(result));
    } catch (e) { throw toDomainError(e); }
});

exports.getPaymentMethods = asyncHandler(async (req, res) => {
    try {
        const methods = await orderService.getPaymentMethods();
        return res.status(200).json(wrap({ methods }));
    } catch (e) { throw toDomainError(e); }
});

exports.getAddress = asyncHandler(async (req, res) => {
    try {
        const result = await orderService.getAddresses(req.user._id);
        return res.status(200).json(wrap({ address: result.address, flag: result.flag }));
    } catch (e) { throw toDomainError(e); }
});

exports.storeAddress = asyncHandler(async (req, res) => {
    try {
        const b = req.body;
        const allowed = {
            _id: b._id, name: b.name, email: b.email, mobile: b.mobile,
            city: b.city, area: b.area, state: b.state,
            country: b.country, countryCode: b.countryCode,
            floorNo: b.floorNo, apartmentNo: b.apartmentNo,
            buildingName: b.buildingName, landmark: b.landmark,
        };
        const result = await orderService.storeAddress(req.user._id, allowed);
        return res.status(200).json(wrap({ addresses: result.addresses }, result.message));
    } catch (e) { throw toDomainError(e); }
});

exports.deleteAddress = asyncHandler(async (req, res) => {
    try {
        const result = await orderService.deleteAddress(req.user._id, req.params.addressId);
        return res.status(200).json(wrap({ addresses: result.addresses }, 'Address deleted successfully'));
    } catch (e) { throw toDomainError(e); }
});

exports.setPrimaryAddress = asyncHandler(async (req, res) => {
    try {
        const result = await orderService.setPrimaryAddress(req.user._id, req.params.addressId);
        return res.status(200).json(wrap({ addresses: result.addresses }, 'Primary address set successfully'));
    } catch (e) { throw toDomainError(e); }
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const filePath = req.file ? req.file.path : null;
        const order = await orderService.updateOrderStatus(orderId, status, filePath, req.user._id);
        return res.status(200).json(wrap({ order }, 'Order status updated successfully'));
    } catch (e) { throw toDomainError(e); }
});
