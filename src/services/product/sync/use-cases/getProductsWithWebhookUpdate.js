'use strict';

const Product = require('../../../../repositories').products.rawModel();

const WEBHOOK_PRODUCT_UPDATE = 'product.update';

/**
 * Get all products that have webhook === 'product.update'.
 * @returns {{ count: number, webhook: string, products: Array }}
 */
async function getProductsWithWebhookUpdate() {
  const products = await Product.find({ webhook: WEBHOOK_PRODUCT_UPDATE })
    .select(
      '_id product.id product.name totalQty status discount originalPrice discountedPrice isHighest webhook webhookTime'
    )
    .lean();

  return {
    count: products.length,
    webhook: WEBHOOK_PRODUCT_UPDATE,
    products,
  };
}

module.exports = { getProductsWithWebhookUpdate };
