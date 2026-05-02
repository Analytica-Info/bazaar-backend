'use strict';

/**
 * product/sync barrel — re-exports all sync use-cases.
 * Consumed by the productSyncService.js thin facade.
 */

const { refreshSingleProductById } = require('./use-cases/refreshSingleProductById');
const { getProductsWithWebhookUpdate } = require('./use-cases/getProductsWithWebhookUpdate');
const { syncWebhookDiscounts } = require('./use-cases/syncWebhookDiscounts');
const { handleProductUpdate } = require('./use-cases/handleProductUpdate');
const { handleInventoryUpdate } = require('./use-cases/handleInventoryUpdate');
const { handleSaleUpdate } = require('./use-cases/handleSaleUpdate');

module.exports = {
  refreshSingleProductById,
  getProductsWithWebhookUpdate,
  syncWebhookDiscounts,
  handleProductUpdate,
  handleInventoryUpdate,
  handleSaleUpdate,
};
