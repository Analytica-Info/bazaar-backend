'use strict';

/**
 * product/ barrel — re-exports all product use-cases.
 * Consumed by the productService.js thin facade.
 */

const { getProducts } = require('./use-cases/getProducts');
const { getProductDetails } = require('./use-cases/getProductDetails');
const { getHomeProducts } = require('./use-cases/getHomeProducts');
const { searchProducts } = require('./use-cases/searchProducts');
const { searchSingleProduct } = require('./use-cases/searchSingleProduct');
const { getCategories } = require('./use-cases/getCategories');
const { getSearchCategories } = require('./use-cases/getSearchCategories');
const { getCategoriesProduct } = require('./use-cases/getCategoriesProduct');
const { getSubCategoriesProduct } = require('./use-cases/getSubCategoriesProduct');
const { getSubSubCategoriesProduct } = require('./use-cases/getSubSubCategoriesProduct');
const { getAllCategories } = require('./use-cases/getAllCategories');
const { getBrands } = require('./use-cases/getBrands');
const { getBrandNameById } = require('./use-cases/getBrandNameById');
const { getCategoryNameById } = require('./use-cases/getCategoryNameById');
const { getRandomProducts } = require('./use-cases/getRandomProducts');
const { getSimilarProducts } = require('./use-cases/getSimilarProducts');
const { fetchDbProducts } = require('./use-cases/fetchDbProducts');
const { fetchProductsNoImages } = require('./use-cases/fetchProductsNoImages');
const { getAllProducts } = require('./use-cases/getAllProducts');
const { trackProductView } = require('./use-cases/trackProductView');

module.exports = {
  getProducts,
  getProductDetails,
  getHomeProducts,
  searchProducts,
  searchSingleProduct,
  getCategories,
  getSearchCategories,
  getCategoriesProduct,
  getSubCategoriesProduct,
  getSubSubCategoriesProduct,
  getAllCategories,
  getBrands,
  getBrandNameById,
  getCategoryNameById,
  getRandomProducts,
  getSimilarProducts,
  fetchDbProducts,
  fetchProductsNoImages,
  getAllProducts,
  trackProductView,
};
