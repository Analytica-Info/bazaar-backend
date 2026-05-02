'use strict';

/**
 * Shared projection constants for smart-category queries.
 * Mirrors productService.js LIST_EXCLUDE_* — keep in sync when adding fields.
 */

const LIST_EXCLUDE_PROJECTION = {
    // Phase 1a
    "product.variants": 0,
    "product.product_codes": 0,
    "product.suppliers": 0,
    "product.composite_bom": 0,
    "product.tag_ids": 0,
    "product.attributes": 0,
    "product.account_code_sales": 0,
    "product.account_code_purchase": 0,
    "product.price_outlet": 0,
    "product.brand_id": 0,
    "product.deleted_at": 0,
    "product.version": 0,
    "product.created_at": 0,
    "product.updated_at": 0,
    // Phase 2
    webhook: 0,
    webhookTime: 0,
    __v: 0,
    updatedAt: 0,
    // Phase 3
    "product.description": 0,
};

const LIST_EXCLUDE_SELECT = [
    // Phase 1a
    "product.variants",
    "product.product_codes",
    "product.suppliers",
    "product.composite_bom",
    "product.tag_ids",
    "product.attributes",
    "product.account_code_sales",
    "product.account_code_purchase",
    "product.price_outlet",
    "product.brand_id",
    "product.deleted_at",
    "product.version",
    "product.created_at",
    "product.updated_at",
    // Phase 2
    "webhook",
    "webhookTime",
    "__v",
    "updatedAt",
    // Phase 3
    "product.description",
]
    .map((f) => `-${f}`)
    .join(" ");

module.exports = { LIST_EXCLUDE_PROJECTION, LIST_EXCLUDE_SELECT };
