/**
 * V2 Web Order Controller (BFF layer)
 */
const orderService = require('../../../services/orderService');
const { wrap } = require('../_shared/responseEnvelope');
const { toDomainError } = require('../_shared/errors');
const { asyncHandler } = require('../../../middleware');

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

exports.validateInventory = asyncHandler(async (req, res) => {
    try {
        const { products } = req.body;
        const result = await orderService.validateInventoryBeforeCheckout(products, req.user, 'Web');
        return res.status(200).json(wrap({ isValid: result.isValid, results: result.results }, result.message));
    } catch (e) { throw toDomainError(e); }
});
