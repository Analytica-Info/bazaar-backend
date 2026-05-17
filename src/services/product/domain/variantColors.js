'use strict';

/**
 * SKU-prefix lookup for the mobile/web "condition by color" filter.
 *
 * Mirrors the v1 SKUS_BY_COLOR map in
 * src/controllers/mobile/smartCategoriesController.js — kept in sync
 * so the v2 unified /products endpoint can resolve `?color=red` to
 * the same SKU prefixes the v1 /products-by-variant endpoint used.
 *
 * If product condition naming ever changes, update BOTH this file
 * and the v1 controller until v1 is retired.
 */
const SKU_PREFIXES_BY_COLOR = Object.freeze({
  orange: ['Slightly Used - UAE Specs', 'Slightly Used - Converted to UAE Specs'],
  green:  ['New - UAE Specs',           'New - Converted to UAE Specs'],
  yellow: ['Open Box - UAE Specs',      'Open Box - Converted to UAE Specs'],
  red:    ['Used - UAE Specs',          'Used - Converted to UAE Specs'],
});

function getSkuPrefixesForColor(color) {
  if (!color) return null;
  return SKU_PREFIXES_BY_COLOR[String(color).toLowerCase()] || null;
}

module.exports = { SKU_PREFIXES_BY_COLOR, getSkuPrefixesForColor };
