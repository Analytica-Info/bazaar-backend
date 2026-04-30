/**
 * V2 Shared Product Controller (BFF layer)
 * Same for mobile and web — no platform-specific divergence.
 */
const productService = require('../../../services/productService');
const { wrap } = require('../_shared/responseEnvelope');
const { handleError } = require('../_shared/errors');

exports.getCategories = async (req, res) => {
    try {
        const result = await productService.getCategories();
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getProducts = async (req, res) => {
    try {
        const result = await productService.getProducts(req.query);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.getProductDetails = async (req, res) => {
    try {
        const userId = req.user?._id || null;
        const result = await productService.getProductDetails(req.params.id, userId);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.search = async (req, res) => {
    try {
        const result = await productService.searchProducts(req.body);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.categoriesProduct = async (req, res) => {
    try {
        const result = await productService.getCategoriesProduct(req.params.id, req.query);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.subCategoriesProduct = async (req, res) => {
    try {
        const result = await productService.getSubCategoriesProduct(req.params.id, req.query);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.subSubCategoriesProduct = async (req, res) => {
    try {
        const result = await productService.getSubSubCategoriesProduct(req.params.id, req.query);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};

exports.similarProducts = async (req, res) => {
    try {
        const result = await productService.getSimilarProducts(req.query.product_type_id, req.query.id);
        return res.status(200).json(wrap(result));
    } catch (error) {
        return handleError(res, error);
    }
};
