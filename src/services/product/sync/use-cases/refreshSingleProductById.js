'use strict';

const Product = require('../../../../repositories').products.rawModel();
const ProductId = require('../../../../repositories').productIds.rawModel();
const logger = require('../../../../utilities/logger');
const { fixZeroTaxInclusive, currentTime } = require('../domain/lightspeedHelpers');
const { fetchProductDetailsForRefresh } = require('../domain/lightspeedFetchers');

/**
 * Refresh a single product by its Lightspeed product ID.
 * Creates a new Product document if it does not exist, otherwise updates.
 * @param {string} productId - The Lightspeed product ID.
 * @returns {Object} { created: boolean, updated: boolean, productId, product }
 */
async function refreshSingleProductById(productId) {
  if (!productId) {
    throw {
      status: 400,
      message: 'Product ID is required.',
    };
  }

  const id = productId;
  logger.info({ id }, '[Refresh Product] requested');

  const existingProductId = await ProductId.findOne({ productId: id });
  if (!existingProductId) {
    await ProductId.create({ productId: id });
    logger.info('[Refresh Product] ProductId was missing in DB — created.');
  } else {
    logger.info('[Refresh Product] ProductId already in ProductId collection.');
  }

  const { product, variantsData, totalQty } = await fetchProductDetailsForRefresh(id);
  fixZeroTaxInclusive(product, variantsData);
  const timeFormatted = await currentTime();
  const type = 'api';
  const productStatus = totalQty > 0;

  const existingEntry = await Product.findOne({ 'product.id': product.id });
  if (existingEntry) {
    logger.info('[Refresh Product] Product already exists in DB (product.id=' + product.id + '). Will update.');
  } else {
    logger.info('[Refresh Product] Product not in DB. Will create new.');
  }

  if (!existingEntry) {
    const newProductDetails = new Product({
      product,
      variantsData,
      totalQty,
      webhook: type,
      webhookTime: timeFormatted,
      status: productStatus,
    });
    await newProductDetails.save();
    logger.info({ productId: product.id }, '[Refresh Product] created in MongoDB');
    const doc = newProductDetails.toObject ? newProductDetails.toObject() : newProductDetails;
    return {
      created: true,
      updated: false,
      productId: product.id,
      product: doc,
    };
  }

  await Product.updateOne(
    { 'product.id': product.id },
    {
      $set: {
        product,
        variantsData,
        totalQty,
        webhook: type,
        webhookTime: timeFormatted,
        status: productStatus,
      },
    }
  );
  logger.info({ productId: product.id }, '[Refresh Product] updated in MongoDB');
  // Must read from primary — must see the updateOne just issued above.
  const updated = await Product.findOne({ 'product.id': product.id }).read('primary').lean();

  return {
    created: false,
    updated: true,
    productId: product.id,
    product: updated,
  };
}

module.exports = { refreshSingleProductById };
