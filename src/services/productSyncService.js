'use strict';

/**
 * productSyncService — thin facade.
 *
 * All 6 exports are re-delegated to per-use-case modules under ./product/sync/.
 * Controllers continue to require this path unchanged. No behavior is modified;
 * this is a structural split only.
 *
 * Layout:
 *   src/services/product/sync/use-cases/  — one file per exported function
 *   src/services/product/sync/domain/     — helpers (lightspeedHelpers, lightspeedFetchers)
 */

const sync = require('./product/sync');

exports.refreshSingleProductById      = sync.refreshSingleProductById;
exports.getProductsWithWebhookUpdate  = sync.getProductsWithWebhookUpdate;
exports.syncWebhookDiscounts          = sync.syncWebhookDiscounts;
exports.handleProductUpdate           = sync.handleProductUpdate;
exports.handleInventoryUpdate         = sync.handleInventoryUpdate;
exports.handleSaleUpdate              = sync.handleSaleUpdate;
