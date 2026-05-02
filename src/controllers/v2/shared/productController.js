/**
 * V2 Shared Product Controller (BFF layer)
 * Same for mobile and web — no platform-specific divergence.
 */
const productService = require('../../../services/productService');
const { wrap } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');

exports.getCategories = asyncHandler(async (req, res) => {
    const result = await productService.getCategories();
    return res.status(200).json(wrap(result));
});

exports.getProducts = asyncHandler(async (req, res) => {
    const result = await productService.getProducts(req.query);
    return res.status(200).json(wrap(result));
});

exports.getProductDetails = asyncHandler(async (req, res) => {
    const userId = req.user?._id || null;
    const result = await productService.getProductDetails(req.params.id, userId);
    return res.status(200).json(wrap(result));
});

exports.search = asyncHandler(async (req, res) => {
    const result = await productService.searchProducts(req.body);
    return res.status(200).json(wrap(result));
});

exports.categoriesProduct = asyncHandler(async (req, res) => {
    const result = await productService.getCategoriesProduct(req.params.id, req.query);
    return res.status(200).json(wrap(result));
});

exports.subCategoriesProduct = asyncHandler(async (req, res) => {
    const result = await productService.getSubCategoriesProduct(req.params.id, req.query);
    return res.status(200).json(wrap(result));
});

exports.subSubCategoriesProduct = asyncHandler(async (req, res) => {
    const result = await productService.getSubSubCategoriesProduct(req.params.id, req.query);
    return res.status(200).json(wrap(result));
});

exports.similarProducts = asyncHandler(async (req, res) => {
    const result = await productService.getSimilarProducts(req.query.product_type_id, req.query.id);
    return res.status(200).json(wrap(result));
});
