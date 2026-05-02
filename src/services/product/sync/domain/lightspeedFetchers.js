'use strict';

/**
 * Lightspeed HTTP fetch helpers used during sync/webhook processing.
 *
 * NOTE: The shared src/services/shared/lightspeedClient.js uses tax_inclusive
 * pricing for checkout. These fetchers serve webhook-driven inventory sync and
 * use a mix of pricing strategies (fetchProductDetailsForRefresh uses
 * tax_inclusive ?? tax_exclusive). They are kept product-local because:
 *   1. Different endpoints (v2.0 vs v3.0 mix, inventory sub-path).
 *   2. Different qty-deduction semantics (parked sales subtraction).
 *   3. Different caller context (sync vs checkout).
 * See docs/BUGS.md BUG-028 for the shared-client pricing note.
 */

const axios = require('axios');
const { mapLimit } = require('async');
const logger = require('../../../../utilities/logger');

const { INVENTORY_CONCURRENCY } = require('../../../../config/constants/business');

const API_KEY = process.env.API_KEY;

async function filterParkProducts() {
  try {
    const productsResponse = await axios.get(
      'https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/search?type=sales&status=SAVED',
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      }
    );

    const allSales = productsResponse.data.data || [];
    const allParkedProductIds = [];

    for (const sale of allSales) {
      if (Array.isArray(sale.line_items)) {
        for (const item of sale.line_items) {
          if (item.product_id) {
            allParkedProductIds.push({
              product: item.product_id,
              qty: Math.floor(item.quantity),
            });
          }
        }
      }
    }

    return allParkedProductIds;
  } catch (error) {
    logger.warn({ err: error.message }, 'Error fetching park products from Lightspeed');
    return [];
  }
}

async function fetchProductDetails(id, qty) {
  logger.debug({ productId: id, qty }, 'fetchProductDetails: start');
  const response = await axios.get(
    `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    }
  );

  let product = response.data.data;
  if (!product) throw new Error('Product not found.');

  const variantsData = [];
  let totalQty = 0;

  if (product.variants.length === 0) {
    logger.debug({ productId: id }, 'fetchProductDetails: no variants, fetching single inventory');
    const inventoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${id}/inventory`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      }
    );

    const is_active = product.is_active;
    if (is_active !== true) {
      logger.debug({ productId: id }, 'fetchProductDetails: product inactive, skipping');
      return { product, variantsData, totalQty };
    }

    let inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
    inventoryLevel = Math.max(inventoryLevel - qty, 0);
    logger.debug(
      { productId: id, inventoryLevel, deducted: qty },
      'fetchProductDetails: inventory (no variants)'
    );

    if (inventoryLevel > 0 && parseFloat(product.price_standard.tax_inclusive) !== 0) {
      variantsData.push({
        qty: inventoryLevel,
        id: product.id,
        sku: product.sku_number,
        name: product.name,
        price: product.price_standard.tax_inclusive,
      });
      totalQty += inventoryLevel;
    }
  } else {
    const activeVariants = product.variants.filter((v) => v.is_active === true);
    logger.debug(
      { productId: id, totalVariants: product.variants.length, activeVariants: activeVariants.length },
      'fetchProductDetails: fetching variant inventories in parallel'
    );

    await mapLimit(activeVariants, INVENTORY_CONCURRENCY, async (variant) => {
      const variantId = variant.id;
      const variantPrice = variant.price_standard.tax_inclusive;
      const variantDefinitions = variant.variant_definitions;
      const sku = variantDefinitions?.length
        ? variantDefinitions.map((def) => def.value).join(' - ')
        : '';

      let inventoryLevel;
      try {
        const inventoryResponse = await axios.get(
          `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: 'application/json',
            },
          }
        );
        inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
      } catch (err) {
        logger.warn(
          { productId: id, variantId, err: err.message },
          'fetchProductDetails: inventory fetch failed for variant, skipping'
        );
        return;
      }

      // The specific variant that triggered this update has qty units already
      // reserved/sold — subtract them from the live count so the UI reflects
      // the correct available stock.
      if (variantId === id) {
        inventoryLevel = Math.max(inventoryLevel - qty, 0);
      }

      logger.debug(
        { productId: id, variantId, inventoryLevel, price: variantPrice },
        'fetchProductDetails: variant inventory'
      );

      if (inventoryLevel > 0 && parseFloat(variantPrice) !== 0) {
        variantsData.push({
          qty: inventoryLevel,
          sku,
          price: variantPrice,
          id: variantId,
          name: variant.name,
        });
        totalQty += inventoryLevel;
      }
    });
  }

  logger.debug(
    { productId: id, variantCount: variantsData.length, totalQty },
    'fetchProductDetails: done'
  );
  return { product, variantsData, totalQty };
}

async function fetchProductInventory(id, inventoryId, qty, status) {
  const response = await axios.get(
    `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    }
  );

  let product = response.data.data;
  if (!product) throw new Error('Product not found.');

  const inventoryResponse = await axios.get(
    `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${inventoryId}/inventory`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    }
  );

  const is_active = product.is_active;
  if (is_active !== true) return { inventoryLevel: 0 };

  let inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
  logger.debug({ inventoryId, status }, 'fetchProductInventory');
  if (status === 'SAVED') {
    inventoryLevel = Math.max(inventoryLevel - qty, 0);
  }

  return { inventoryLevel };
}

async function fetchProductInventoryDetails(itemId, matchedProductIds = []) {
  logger.debug(
    { itemId, parkedMatchCount: matchedProductIds.length },
    'fetchProductInventoryDetails: start'
  );
  const response = await axios.get(
    `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${itemId}`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    }
  );

  let product = response.data.data;
  if (!product) throw new Error('Product not found.');

  const variantsData = [];
  let totalQty = 0;

  // Build a Map for O(1) parked-qty lookup instead of O(n) Array.find per variant.
  const parkedQtyMap = new Map(
    matchedProductIds.map((v) => [v.product, Math.floor(v.qty)])
  );
  const getMatchedQty = (variantId) => parkedQtyMap.get(variantId) ?? 0;

  if (product.variants.length === 0) {
    logger.debug(
      { itemId },
      'fetchProductInventoryDetails: no variants, fetching single inventory'
    );
    const inventoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${itemId}/inventory`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      }
    );

    const is_active = product.is_active;
    if (is_active !== true) {
      logger.debug({ itemId }, 'fetchProductInventoryDetails: product inactive, skipping');
      return { product, variantsData, totalQty };
    }

    const matchedQty = getMatchedQty(product.id);
    let inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
    inventoryLevel = Math.max(inventoryLevel - matchedQty, 0);
    logger.debug(
      { itemId, inventoryLevel, parkedDeduction: matchedQty },
      'fetchProductInventoryDetails: inventory (no variants)'
    );

    if (inventoryLevel > 0 && parseFloat(product.price_standard.tax_inclusive) !== 0) {
      variantsData.push({
        qty: inventoryLevel,
        id: product.id,
        sku: product.sku_number,
        name: product.name,
        price: product.price_standard.tax_inclusive,
      });
      totalQty += inventoryLevel;
    }
  } else {
    const activeVariants = product.variants.filter((v) => v.is_active);
    logger.debug(
      {
        itemId,
        totalVariants: product.variants.length,
        activeVariants: activeVariants.length,
      },
      'fetchProductInventoryDetails: fetching variant inventories in parallel'
    );

    await mapLimit(activeVariants, INVENTORY_CONCURRENCY, async (variant) => {
      const variantId = variant.id;
      const matchedQty = getMatchedQty(variantId);
      const variantPrice = variant.price_standard.tax_inclusive;
      const sku = variant.variant_definitions?.length
        ? variant.variant_definitions.map((def) => def.value).join(' - ')
        : '';

      let inventoryLevel;
      try {
        const inventoryResponse = await axios.get(
          `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: 'application/json',
            },
          }
        );
        inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
      } catch (err) {
        logger.warn(
          { itemId, variantId, err: err.message },
          'fetchProductInventoryDetails: inventory fetch failed for variant, skipping'
        );
        return;
      }

      inventoryLevel = Math.max(inventoryLevel - matchedQty, 0);
      logger.debug(
        { itemId, variantId, inventoryLevel, parkedDeduction: matchedQty, price: variantPrice },
        'fetchProductInventoryDetails: variant inventory'
      );

      if (inventoryLevel > 0 && parseFloat(variantPrice) !== 0) {
        variantsData.push({
          qty: inventoryLevel,
          id: variantId,
          sku,
          name: variant.name,
          price: variantPrice,
        });
        totalQty += inventoryLevel;
      }
    });
  }

  logger.debug(
    { itemId, variantCount: variantsData.length, totalQty },
    'fetchProductInventoryDetails: done'
  );
  return { product, variantsData, totalQty };
}

/**
 * Refresh product details from Lightspeed (used by productRefreshController).
 * Uses tax_inclusive ?? tax_exclusive pricing (refresh-specific behavior).
 */
async function fetchProductDetailsForRefresh(id) {
  logger.info({ id }, '[Refresh Product] Hitting Lightspeed API: GET /api/3.0/products/:id');
  const response = await axios.get(
    `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
      },
    }
  );

  const product = response.data.data;
  if (!product) throw new Error('Product not found.');

  const variantsData = [];
  let totalQty = 0;

  if (product.variants.length === 0) {
    logger.info(
      '[Refresh Product] Hitting Lightspeed API: GET /api/2.0/products/' + id + '/inventory'
    );
    const inventoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${id}/inventory`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      }
    );
    const is_active = product.is_active;
    if (is_active !== true) throw new Error('Product is not active.');
    const inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
    const ps = product.price_standard || {};
    const price = ps.tax_inclusive ?? ps.tax_exclusive;
    logger.debug(
      { taxExclusive: ps.tax_exclusive, taxInclusive: ps.tax_inclusive, storingPrice: price },
      '[Refresh Product] price (no variants)'
    );
    if (inventoryLevel > 0 && parseFloat(price) !== 0) {
      variantsData.push({
        qty: inventoryLevel,
        id: product.id,
        sku: product.sku_number,
        name: product.name,
        price,
      });
      totalQty += inventoryLevel;
    }
  } else {
    const activeVariants = product.variants.filter((v) => v.is_active === true);
    logger.info(
      { id, totalVariants: product.variants.length, activeVariants: activeVariants.length },
      '[Refresh Product] fetching variant inventories in parallel'
    );

    await mapLimit(activeVariants, INVENTORY_CONCURRENCY, async (variant) => {
      const variantId = variant.id;
      const pv = variant.price_standard || {};
      const variantPrice = pv.tax_inclusive ?? pv.tax_exclusive;
      const sku = variant.variant_definitions?.length
        ? variant.variant_definitions.map((d) => d.value).join(' - ')
        : '';

      logger.info(
        { variantId },
        '[Refresh Product] Hitting Lightspeed API: GET /api/2.0/products/:variantId/inventory'
      );
      let inventoryLevel;
      try {
        const inventoryResponse = await axios.get(
          `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: 'application/json',
            },
          }
        );
        inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
      } catch (err) {
        logger.warn(
          { id, variantId, err: err.message },
          '[Refresh Product] inventory fetch failed for variant, skipping'
        );
        return;
      }

      logger.debug(
        {
          variantId,
          taxExclusive: pv.tax_exclusive,
          taxInclusive: pv.tax_inclusive,
          storingPrice: variantPrice,
          inventoryLevel,
        },
        '[Refresh Product] price (variant)'
      );

      if (inventoryLevel > 0 && parseFloat(variantPrice) !== 0) {
        variantsData.push({
          qty: inventoryLevel,
          sku,
          price: variantPrice,
          id: variantId,
          name: variant.name,
        });
        totalQty += inventoryLevel;
      }
    });
  }

  logger.debug(
    { variantsData: variantsData.map((v) => ({ id: v.id, sku: v.sku, price: v.price, qty: v.qty })) },
    '[Refresh Product] variantsData to store'
  );
  return { product, variantsData, totalQty };
}

module.exports = {
  filterParkProducts,
  fetchProductDetails,
  fetchProductInventory,
  fetchProductInventoryDetails,
  fetchProductDetailsForRefresh,
};
