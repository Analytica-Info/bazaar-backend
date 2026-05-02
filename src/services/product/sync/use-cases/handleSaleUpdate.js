'use strict';

const Product = require('../../../../repositories').products.rawModel();
const logger = require('../../../../utilities/logger');
const cache = require('../../../../utilities/cache');
const metrics = require('../../../metricsService');
const { applyDiscountFieldsForParentProductId } = require('../../../../helpers/productDiscountSync');
const { currentTime } = require('../domain/lightspeedHelpers');
const { fetchProductInventory } = require('../domain/lightspeedFetchers');

// Redis-backed dedup lock TTL (seconds).
const WEBHOOK_DEDUP_TTL = 3;

/**
 * Handle Lightspeed sale webhook (register_sale.update / register_sale.save).
 * @param {Object} data - { payload, type }
 * @returns {{ success: boolean }}
 */
async function handleSaleUpdate(data) {
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
  const updateProductId = parsedPayload.register_sale_products[0].product_id;
  const updateProductQty = parsedPayload.register_sale_products[0].quantity;
  const updateProductStatus = parsedPayload.status;

  if (!productId) {
    throw { status: 400, message: 'Missing product ID' };
  }

  // Dedup on sale ID + product ID — same sale firing multiple times is safe to drop.
  const dedupKey = cache.key(
    'webhook',
    'sale-update',
    String(productId),
    String(updateProductId)
  );
  const alreadyProcessing = await cache.get(dedupKey);
  if (alreadyProcessing) {
    logger.info({ productId, updateProductId }, 'Skipping duplicate sale.update (dedup lock held)');
    metrics.recordDedup('sale-update').catch(() => {});
    return { success: true, skipped: true };
  }
  await cache.set(dedupKey, '1', WEBHOOK_DEDUP_TTL);
  metrics.recordWebhook('sale-update').catch(() => {});

  const timeFormatted = await currentTime();
  logger.info(
    { type, productId: updateProductId, qty: updateProductQty, status: updateProductStatus },
    'Received Parked Product'
  );

  const matchedProduct = await Product.findOne({
    'variantsData.id': updateProductId,
  });

  if (matchedProduct) {
    logger.info(`Parent Parked Product Id: ${matchedProduct.product.id}`);
    const itemId = matchedProduct.product.id;
    // Reuse matchedProduct — it was already fetched above for 'variantsData.id' lookup.
    const productDoc = matchedProduct;
    if (productDoc) {
      const { inventoryLevel } = await fetchProductInventory(
        itemId,
        updateProductId,
        updateProductQty,
        updateProductStatus
      );
      const updatedVariants = productDoc.variantsData.map((variant) => {
        if (variant.id === updateProductId) {
          return { ...variant, qty: inventoryLevel };
        }
        return variant;
      });

      const totalQty = updatedVariants.reduce((sum, v) => sum + (v.qty || 0), 0);
      const webhook = type;
      const webhookTime = timeFormatted;

      await Product.updateOne(
        { 'product.id': itemId },
        {
          $set: {
            variantsData: updatedVariants,
            totalQty,
            webhook,
            webhookTime,
          },
        }
      );

      logger.info({ productId: updateProductId, type }, 'Parked Sale Inventory Updated');

      try {
        await applyDiscountFieldsForParentProductId(itemId, type, timeFormatted);
      } catch (discountErr) {
        logger.error({ err: discountErr }, 'saleUpdate discount sync failed:');
      }
    }
  } else {
    logger.info(
      { variantId: updateProductId, qty: updateProductQty, status: updateProductStatus },
      'No parked product found for variant'
    );
  }

  // Invalidate trending/today-deal/favourites — sold quantities have changed
  await Promise.all([
    cache.delPattern('catalog:trending:*'),
    cache.del(cache.key('catalog', 'today-deal', 'v1')),
    cache.del(cache.key('catalog', 'favourites-of-week', 'v1')),
  ]);
  logger.info({ type }, 'cache invalidated after register_sale.update');

  return { success: true };
}

module.exports = { handleSaleUpdate };
