'use strict';

const Product = require('../../../../repositories').products.rawModel();
const logger = require('../../../../utilities/logger');
const cache = require('../../../../utilities/cache');
const metrics = require('../../../metricsService');
const { applyDiscountFieldsForParentProductId } = require('../../../../helpers/productDiscountSync');
const { currentTime, getMatchingProductIds } = require('../domain/lightspeedHelpers');
const { filterParkProducts, fetchProductInventoryDetails } = require('../domain/lightspeedFetchers');

// Redis-backed dedup lock TTL (seconds).
const runtimeConfig = require('../../../../config/runtime');
const WEBHOOK_DEDUP_TTL = runtimeConfig.cache.webhookDedupTtl;

/**
 * Handle Lightspeed inventory.update webhook.
 * @param {Object} data - { payload, type }
 * @returns {{ success: boolean }}
 */
async function handleInventoryUpdate(data) {
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
  const updateProduct = parsedPayload?.product;
  const updateProductId = updateProduct.variant_parent_id
    ? updateProduct.variant_parent_id
    : updateProduct.id;

  if (!productId) {
    throw { status: 400, message: 'Missing product ID' };
  }

  // Redis dedup — drop duplicate inventory.update for the same productId within TTL.
  const dedupKey = cache.key('webhook', 'inventory-update', updateProductId);
  const alreadyProcessing = await cache.get(dedupKey);
  if (alreadyProcessing) {
    logger.info({ updateProductId }, 'Skipping duplicate inventory.update (dedup lock held)');
    metrics.recordDedup('inventory-update').catch(() => {});
    return { success: true, skipped: true };
  }
  await cache.set(dedupKey, '1', WEBHOOK_DEDUP_TTL);
  metrics.recordWebhook('inventory-update').catch(() => {});

  const timeFormatted = await currentTime();
  logger.info(`${timeFormatted} ${type} - Received Inventory Update for ID : ${updateProductId}`);

  const allParkedProductIds = await filterParkProducts();
  logger.debug({ count: allParkedProductIds.length }, 'All Parked ProductIds');
  const result = getMatchingProductIds(updateProductId, allParkedProductIds);
  logger.debug({ result }, 'Matched Product IDs');
  let itemId;
  if (result.length > 0) {
    itemId = result[0].product;
  } else {
    itemId = updateProductId;
  }

  const matchedProductIds = [];

  // Batch fetch — one query instead of one per parked item.
  const allParkedVariantIds2 = allParkedProductIds.map((item) => item.product);
  const batchedParkedProducts2 = await Product.find({
    'variantsData.id': { $in: allParkedVariantIds2 },
  })
    .select('product variantsData')
    .lean();

  const variantToProductMap2 = new Map();
  for (const prod of batchedParkedProducts2) {
    for (const v of prod.variantsData || []) {
      variantToProductMap2.set(v.id, prod);
    }
  }

  for (const item of allParkedProductIds) {
    const matchedParentProduct = variantToProductMap2.get(item.product);

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

  logger.debug({ matchedProductIds }, 'Matched Parent Product IDs');

  const { variantsData, totalQty } = await fetchProductInventoryDetails(itemId, matchedProductIds);
  const webhook = type;
  const webhookTime = timeFormatted;
  await Product.updateOne(
    { 'product.id': itemId },
    { $set: { variantsData, totalQty, webhook, webhookTime } }
  );
  logger.info({ itemId, type }, 'Inventory Updated Product');

  try {
    await applyDiscountFieldsForParentProductId(itemId, type, timeFormatted);
  } catch (discountErr) {
    logger.error({ err: discountErr }, 'inventoryUpdate discount sync failed:');
  }

  // Invalidate catalog + product caches — inventory/totalQty affects product listings and variants
  await Promise.all([
    cache.delPattern('catalog:*'),
    cache.delPattern('product:*'),
    cache.del(cache.key('lightspeed', 'products-inventory', 'v1')),
  ]);
  logger.info({ productId: itemId, type }, 'cache invalidated after inventory.update');

  return { success: true };
}

module.exports = { handleInventoryUpdate };
