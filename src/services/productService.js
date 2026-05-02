'use strict';

/**
 * productService — thin facade.
 *
 * All 19 exports are re-delegated to per-use-case modules under ./product/.
 * Controllers continue to require this path unchanged. No behavior is modified;
 * this is a structural split only.
 *
 * Layout:
 *   src/services/product/use-cases/  — one file per exported function
 *   src/services/product/domain/     — pure helpers (projections, statusLogger, spelling)
 *   src/services/product/adapters/   — cache/Lightspeed adapters
 */

const product = require('./product');

exports.getProducts                  = product.getProducts;
exports.getProductDetails            = product.getProductDetails;
exports.getHomeProducts              = product.getHomeProducts;
exports.searchProducts               = product.searchProducts;
exports.searchSingleProduct          = product.searchSingleProduct;
exports.getCategories                = product.getCategories;
exports.getSearchCategories          = product.getSearchCategories;
exports.getCategoriesProduct         = product.getCategoriesProduct;
exports.getSubCategoriesProduct      = product.getSubCategoriesProduct;
exports.getSubSubCategoriesProduct   = product.getSubSubCategoriesProduct;
exports.getAllCategories              = product.getAllCategories;
exports.getBrands                    = product.getBrands;
exports.getBrandNameById             = product.getBrandNameById;
exports.getCategoryNameById          = product.getCategoryNameById;
exports.getRandomProducts            = product.getRandomProducts;
exports.getSimilarProducts           = product.getSimilarProducts;
exports.fetchDbProducts              = product.fetchDbProducts;
exports.fetchProductsNoImages        = product.fetchProductsNoImages;
exports.getAllProducts                = product.getAllProducts;
