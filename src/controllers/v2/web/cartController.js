/**
 * V2 Web Cart Controller (BFF layer)
 */
const cartService = require('../../../services/cartService');
const { wrap } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');

exports.getCart = async (req, res) => {
    try {
        const result = await cartService.getCart(req.user._id);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.addToCart = async (req, res) => {
    try {
        const result = await cartService.addToCart(req.user._id, req.body);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.removeFromCart = async (req, res) => {
    try {
        const result = await cartService.removeFromCart(req.user._id, req.body);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.increaseQty = async (req, res) => {
    try {
        const result = await cartService.increaseQty(req.user._id, req.body);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.decreaseQty = async (req, res) => {
    try {
        const result = await cartService.decreaseQty(req.user._id, req.body);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};
