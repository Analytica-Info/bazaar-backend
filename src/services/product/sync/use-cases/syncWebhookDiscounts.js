'use strict';

const Product = require('../../../../repositories').products.rawModel();
const logger = require('../../../../utilities/logger');
const clock = require('../../../../utilities/clock');
const { syncDiscountFieldsForParentIds } = require('../../../../helpers/productDiscountSync');

const WEBHOOK_PRODUCT_UPDATE = 'product.update';
const WEBHOOK_AFTER_SYNC = 'updateProductDiscounts';

/**
 * Sync discount fields for all products with webhook === 'product.update'.
 * @returns {Object} Sync result summary.
 */
async function syncWebhookDiscounts() {
  const rows = await Product.find({ webhook: WEBHOOK_PRODUCT_UPDATE })
    .select('product.id')
    .lean();

  const parentIds = [...new Set(rows.map((r) => r.product?.id).filter(Boolean))];

  const webhookTime = clock.now().toLocaleString('en-US', {
    timeZone: 'Asia/Dubai',
    hour12: true,
  });

  logger.info({ parentIds }, 'syncWebhookDiscounts: parent IDs to sync');

  const result = await syncDiscountFieldsForParentIds(
    parentIds,
    WEBHOOK_AFTER_SYNC,
    webhookTime
  );

  return {
    distinctParentIds: parentIds.length,
    syncedParentIds: result.syncedParentIds,
    skippedNotEligible: result.skippedParentIds,
    bulkWriteOperations: result.bulkWriteCount,
  };
}

module.exports = { syncWebhookDiscounts };
