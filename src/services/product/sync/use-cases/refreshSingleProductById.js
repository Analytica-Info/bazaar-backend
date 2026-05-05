'use strict';

const axios = require('axios');
const Product = require('../../../../repositories').products.rawModel();
const ProductId = require('../../../../repositories').productIds.rawModel();
const logger = require('../../../../utilities/logger');
const { fixZeroTaxInclusive, currentTime } = require('../domain/lightspeedHelpers');
const { fetchProductDetailsForRefresh } = require('../domain/lightspeedFetchers');

const API_KEY = process.env.API_KEY;
const LS_BASE = 'https://bazaargeneraltrading.retail.lightspeed.app/api';

// Lightspeed 3.0 dropped `ecwid_enabled_webstore`; only 2.0 still exposes it.
// Without this, refresh paths fall back to qty>0 and silently re-publish
// in-store-only items online.
async function fetchOnlineStatusFromV2(productId) {
  try {
    const res = await axios.get(`${LS_BASE}/2.0/products/${productId}`, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
    });
    return res?.data?.data?.ecwid_enabled_webstore;
  } catch (err) {
    // Fail-safe: if 2.0 is unreachable, treat as in-store-only rather than
    // accidentally publishing the product online.
    logger.warn({ productId, err: err.message }, '[Refresh Product] online-status v2 lookup failed');
    return undefined;
  }
}

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

  const existingEntry = await Product.findOne({ 'product.id': product.id });
  if (existingEntry) {
    logger.info('[Refresh Product] Product already exists in DB (product.id=' + product.id + '). Will update.');
  } else {
    logger.info('[Refresh Product] Product not in DB. Will create new.');
  }

  if (!existingEntry) {
    // Status (online/in-store) only needs computing on create. Lightspeed 3.0
    // doesn't return ecwid_enabled_webstore — must consult 2.0 directly.
    const onlineStatus = await fetchOnlineStatusFromV2(id);
    const productStatus = onlineStatus === true && totalQty > 0;
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

  // Update path intentionally does NOT touch `status`. The merchant's
  // ecwid_enabled_webstore setting is owned by the product.update webhook
  // handler. Refresh is a data-correctness operation and must not silently
  // flip in-store-only products online.
  await Product.updateOne(
    { 'product.id': product.id },
    {
      $set: {
        product,
        variantsData,
        totalQty,
        webhook: type,
        webhookTime: timeFormatted,
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
