'use strict';

/**
 * Shared list-endpoint projection constants.
 *
 * Audit (2026-04-24) confirmed these fields are NEVER read by mobile, web, or
 * admin frontends when rendering product lists. They account for ~60-70% of
 * every product list payload. Detail endpoint (getProductDetails) keeps them.
 *
 * When adding new list endpoints, use one of:
 *   - Aggregate:  pipeline.push({ $project: LIST_EXCLUDE_PROJECTION })
 *   - Mongoose:   Product.find(...).select(LIST_EXCLUDE_SELECT).lean()
 */

const LIST_EXCLUDE_PROJECTION = {
  // Phase 1a — raw Lightspeed fields never rendered in lists
  'product.variants': 0,
  'product.product_codes': 0,
  'product.suppliers': 0,
  'product.composite_bom': 0,
  'product.tag_ids': 0,
  'product.attributes': 0,
  'product.account_code_sales': 0,
  'product.account_code_purchase': 0,
  'product.price_outlet': 0,
  'product.brand_id': 0,
  'product.deleted_at': 0,
  'product.version': 0,
  'product.created_at': 0,
  'product.updated_at': 0,
  // Phase 2 — wrapper-level backend internals, not used by any frontend
  webhook: 0,
  webhookTime: 0,
  __v: 0,
  updatedAt: 0, // top-level wrapper updatedAt — keep createdAt (admin gift page uses it)
  // Phase 3 — HTML description only shown on product DETAIL page, not on cards/lists
  'product.description': 0,
};

const LIST_EXCLUDE_SELECT = [
  // Phase 1a
  'product.variants',
  'product.product_codes',
  'product.suppliers',
  'product.composite_bom',
  'product.tag_ids',
  'product.attributes',
  'product.account_code_sales',
  'product.account_code_purchase',
  'product.price_outlet',
  'product.brand_id',
  'product.deleted_at',
  'product.version',
  'product.created_at',
  'product.updated_at',
  // Phase 2
  'webhook',
  'webhookTime',
  '__v',
  'updatedAt',
  // Phase 3
  'product.description',
]
  .map((f) => `-${f}`)
  .join(' ');

module.exports = { LIST_EXCLUDE_PROJECTION, LIST_EXCLUDE_SELECT };
