/**
 * V2 Web Order Controller (BFF layer)
 */
const orderService = require('../../../services/orderService');
const { wrap } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');

exports.getAddress = async (req, res) => {
    try {
        const result = await orderService.getAddresses(req.user._id);
        return res.status(200).json(wrap({ address: result.address, flag: result.flag }));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.storeAddress = async (req, res) => {
    try {
        const result = await orderService.storeAddress(req.user._id, req.body);
        return res.status(200).json(wrap({ addresses: result.addresses }, result.message));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const result = await orderService.deleteAddress(req.user._id, req.params.addressId);
        return res.status(200).json(wrap({ addresses: result.addresses }, 'Address deleted successfully'));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.setPrimaryAddress = async (req, res) => {
    try {
        const result = await orderService.setPrimaryAddress(req.user._id, req.params.addressId);
        return res.status(200).json(wrap({ addresses: result.addresses }, 'Primary address set successfully'));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.validateInventory = async (req, res) => {
    try {
        const { products } = req.body;
        const result = await orderService.validateInventoryBeforeCheckout(products, req.user, 'Web');
        return res.status(200).json(wrap({ isValid: result.isValid, results: result.results }, result.message));
    } catch (error) {
        if (error.status === 400 && error.data) {
            return res.status(400).json({ success: false, ...error.data });
        }
        return handleError(res, error);
    }
};
