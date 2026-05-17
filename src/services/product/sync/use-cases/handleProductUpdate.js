'use strict';

const axios = require('axios');
const Product = require('../../../../repositories').products.rawModel();
const ProductId = require('../../../../repositories').productIds.rawModel();
const logger = require('../../../../utilities/logger');
const cache = require('../../../../utilities/cache');
const metrics = require('../../../metricsService');
const { applyDiscountFieldsForParentProductId } = require('../../../../helpers/productDiscountSync');
const { fixZeroTaxInclusive, currentTime } = require('../domain/lightspeedHelpers');
const { fetchProductDetails, filterParkProducts, fetchProductInventoryDetails } = require('../domain/lightspeedFetchers');
const { getMatchingProductIds } = require('../domain/lightspeedHelpers');

const API_KEY = process.env.API_KEY;

// Redis-backed dedup lock TTL (seconds).
const runtimeConfig = require('../../../../config/runtime');
const WEBHOOK_DEDUP_TTL = runtimeConfig.cache.webhookDedupTtl;

async function inventoryProductDetailUpdate(type, updateProductId, timeFormatted) {
  const allParkedProductIds = await filterParkProducts();
  const result = getMatchingProductIds(updateProductId, allParkedProductIds);
  let itemId;
  if (result.length > 0) {
    itemId = result[0].product;
  } else {
    itemId = updateProductId;
  }

  const matchedProductIds = [];

  // Batch fetch all parked products in a single query instead of one per item.
  const allParkedVariantIds = allParkedProductIds.map((item) => item.product);
  const parkedQtyMap = new Map(allParkedProductIds.map((item) => [item.product, item.qty]));
  const batchedParkedProducts = await Product.find({
    'variantsData.id': { $in: allParkedVariantIds },
  })
    .select('product variantsData')
    .lean();

  const variantToProductMap = new Map();
  for (const prod of batchedParkedProducts) {
    for (const v of prod.variantsData || []) {
      variantToProductMap.set(v.id, prod);
    }
  }

  for (const item of allParkedProductIds) {
    const matchedParentProduct = variantToProductMap.get(item.product);

    if (matchedParentProduct && matchedParentProduct.product?.id) {
      const matchedVariant = (matchedParentProduct.variantsData || []).find(
        (variant) => variant.id === item.product
      );

      if (matchedVariant) {
        matchedProductIds.push({
          product: matchedVariant.id,
          qty: Math.floor(item.qty),
        });
      }
    }
  }

  const { variantsData, totalQty } = await fetchProductInventoryDetails(itemId, matchedProductIds);
  const status = totalQty !== 0;
  const webhook = type;
  const webhookTime = timeFormatted;
  await Product.updateOne(
    { 'product.id': itemId, status: true },
    { $set: { variantsData, totalQty, status, webhook, webhookTime } }
  );
  logger.info({ itemId, type }, 'Inventory Updated (Product Update)');
  return itemId;
}

/**
 * Handle Lightspeed product.update webhook.
 * @param {Object} data - { payload, type }
 * @returns {{ success: boolean }}
 */
async function handleProductUpdate(data) {
  const { payload, type } = data;

  if (!payload) {
    throw { status: 400, message: 'No payload received' };
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payload);
  } catch (err) {
    throw { status: 400, message: 'Invalid JSON in payload' };
  }

  const productId = parsedPayload?.id;
  const updateProduct = parsedPayload;
  const updateProductId = updateProduct.variant_parent_id
    ? updateProduct.variant_parent_id
    : updateProduct.id;

  // Redis dedup — drop duplicate product.update for the same ID within TTL window.
  const dedupKey = cache.key('webhook', 'product-update', updateProductId);
  const alreadyProcessing = await cache.get(dedupKey);
  if (alreadyProcessing) {
    logger.info({ updateProductId }, 'Skipping duplicate product.update (dedup lock held)');
    metrics.recordDedup('product-update').catch(() => {});
    return { success: true, skipped: true };
  }
  await cache.set(dedupKey, '1', WEBHOOK_DEDUP_TTL);
  metrics.recordWebhook('product-update').catch(() => {});

  if (!productId) {
    throw { status: 400, message: 'Missing product ID' };
  }

  const timeFormatted = await currentTime();
  logger.info(`${timeFormatted} ${type} - Received Product Update for ID : ${updateProductId}`);

  const response = await axios.get(
    `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${updateProductId}`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    }
  );

  const productDetail = response.data.data;
  const onlineStatus = productDetail.ecwid_enabled_webstore;

  const existingProductId = await ProductId.findOne({ productId: updateProductId });
  const webhook = type;
  const webhookTime = timeFormatted;
  if (existingProductId) {
    const { product, variantsData } = await fetchProductDetails(updateProductId, 0);
    fixZeroTaxInclusive(product, variantsData);
    await Product.updateOne(
      { 'product.id': product.id },
      {
        $set: {
          product,
          status: onlineStatus === true,
          webhook,
          webhookTime,
        },
      }
    );
    logger.info({ productId: product.id, type }, 'Product Details Updated');
  }

  const parentProductId = await inventoryProductDetailUpdate(type, updateProductId, timeFormatted);
  try {
    await applyDiscountFieldsForParentProductId(parentProductId, type, timeFormatted);
  } catch (discountErr) {
    logger.error({ err: discountErr }, 'product.update discount sync failed:');
  }

  // Invalidate all catalog + product caches — product data (price, discount, status) has changed
  await Promise.all([
    cache.delPattern('catalog:*'),
    cache.delPattern('product:*'),
    cache.del(cache.key('lightspeed', 'categories', 'v1')),
  ]);
  logger.info({ productId: updateProductId, type }, 'cache invalidated after product.update');

  return { success: true };
}

module.exports = { handleProductUpdate };
