'use strict';

/**
 * V2 Shared Product Controller (BFF layer)
 * Same for mobile and web — no platform-specific divergence.
 */
const productService = require('../../../services/productService');
const { wrap, wrapError } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');

/**
 * GET /v2/categories
 * Returns the full category tree. Public — no auth required.
 * TODO: Wave 4 — consider extracting to a dedicated categoryController.
 */
exports.listCategories = asyncHandler(async (req, res) => {
    // If query param `q` is provided, delegate to category search.
    const q = (req.query.q || '').trim();
    if (q) {
        const result = await productService.getSearchCategories({ category_name: q });
        return res.status(200).json(wrap({ categories: result.side_bar_categories }));
    }
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

/**
 * GET /v2/categories/:id/products?depth=N
 * Unified handler replacing three separate endpoints:
 *   depth=1 (default) — category products
 *   depth=2           — sub-category products
 *   depth=3           — sub-sub-category products
 */
exports.listCategoryProducts = asyncHandler(async (req, res) => {
    const depth = parseInt(req.query.depth, 10) || 1;
    let result;
    if (depth === 3) {
        result = await productService.getSubSubCategoriesProduct(req.params.id, req.query);
    } else if (depth === 2) {
        result = await productService.getSubCategoriesProduct(req.params.id, req.query);
    } else {
        result = await productService.getCategoriesProduct(req.params.id, req.query);
    }
    return res.status(200).json(wrap(result));
});

/**
 * GET /v2/products/:id/similar
 * Id moves to URL segment; was previously GET /products/similar?id=...
 */
exports.listSimilarProducts = asyncHandler(async (req, res) => {
    const result = await productService.getSimilarProducts(req.query.product_type_id, req.params.id);
    return res.status(200).json(wrap(result));
});

/**
 * GET /v2/categories?q=<term>
 * Kept as a named alias for backward-compat within this file; listCategories handles both.
 * @deprecated Use listCategories (handles q param inline).
 */
exports.searchCategories = asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) {
        return res.status(400).json(wrapError('VALIDATION_ERROR', 'Query parameter "q" is required'));
    }
    const result = await productService.getSearchCategories({ category_name: q });
    return res.status(200).json(wrap({ categories: result.side_bar_categories }));
});
