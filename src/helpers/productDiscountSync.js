'use strict';

const Product = require('../repositories').products.rawModel();
const metrics = require("../services/metricsService");
const cache = require("../utilities/cache");
const logger = require("../utilities/logger");
const runtimeConfig = require("../config/runtime");

const eligibleDiscountProductFilter = {
  $or: [{ status: { $exists: false } }, { status: true }],
  totalQty: { $gt: 0 },
};

// Redis key that stores the current global max discount (e.g. "72").
// TTL is intentionally long — it gets invalidated explicitly whenever the
// leaderboard changes, and refreshed by the nightly cron in any case.
const MAX_DISCOUNT_CACHE_KEY = "metrics:discount:max-discount";
const MAX_DISCOUNT_TTL = runtimeConfig.cache.maxDiscountTtl; // 6 hours default

function calculateDiscount(product) {
  const originalPrice = Math.round(
    product.product?.price_standard?.tax_inclusive / 0.65
  );
  let discount = 0;
  if (product.variantsData && product.variantsData.length > 0) {
    product.variantsData.forEach((variant) => {
      const discountPercentage = Math.round(
        ((originalPrice - variant.price) / originalPrice) * 100
      );
      if (discountPercentage > discount) {
        discount = discountPercentage;
      }
    });
  }
  return discount;
}

function computeProductDiscountFields(product) {
  const discount = calculateDiscount(product);
  const originalPrice = Number(
    (product.product?.price_standard?.tax_inclusive / 0.65).toFixed(2)
  );

  let highestDiscountPercentage = 0;
  let highestDiscountVariant = null;
  if (product.variantsData && product.variantsData.length > 0) {
    product.variantsData.forEach((variant) => {
      const discountPercentage = Number(
        (((originalPrice - variant.price) / originalPrice) * 100).toFixed(2)
      );
      if (discountPercentage > highestDiscountPercentage) {
        highestDiscountPercentage = discountPercentage;
        highestDiscountVariant = variant;
      }
    });
  }

  return {
    discount,
    originalPrice,
    discountedPrice: highestDiscountVariant?.price,
  };
}

// ---------------------------------------------------------------------------
// Full scan — reads all eligible products, recomputes global max, writes back
// to every product. Used on cache miss or when the leaderboard must change.
// ---------------------------------------------------------------------------
async function fullScanAndSync(targetIdSet, webhook, webhookTime) {
  const products = await Product.find(eligibleDiscountProductFilter).lean();
  const enriched = products.map((p) => ({
    ...p,
    ...computeProductDiscountFields(p),
  }));
  const maxDiscount = Math.max(0, ...enriched.map((p) => p.discount || 0));

  // Persist the new global max so future webhooks can skip this scan.
  cache.set(MAX_DISCOUNT_CACHE_KEY, String(maxDiscount), MAX_DISCOUNT_TTL).catch((err) => {
    logger.warn({ err: err.message, maxDiscount }, 'discountSync: cache.set failed — next webhook will full-scan again');
    metrics.recordError('discountSync:cache-set', err.message).catch(() => {});
  });

  const syncedParentIds = new Set();
  const bulkOps = enriched.map((p) => {
    const isTarget = targetIdSet.has(p.product?.id);
    if (isTarget) syncedParentIds.add(p.product.id);
    const $set = { isHighest: p.discount === maxDiscount };
    if (isTarget) {
      Object.assign($set, {
        discount: p.discount,
        originalPrice: p.originalPrice,
        discountedPrice: p.discountedPrice,
        webhook,
        webhookTime,
      });
    }
    return { updateOne: { filter: { _id: p._id }, update: { $set } } };
  });

  if (bulkOps.length) {
    await Product.bulkWrite(bulkOps);
    metrics.recordDiscountSync(bulkOps.length).catch(() => {});
  }

  return {
    bulkWriteCount: bulkOps.length,
    syncedParentIds: [...syncedParentIds],
    skippedParentIds: [...targetIdSet].filter((id) => !syncedParentIds.has(id)),
    path: "full-scan",
  };
}

// ---------------------------------------------------------------------------
// Fast path — only touches the target product(s) plus the old isHighest holder.
// Used when we know the leaderboard has not changed.
// ---------------------------------------------------------------------------
async function fastSync(targetProduct, newFields, maxDiscount, isNewLeader, webhook, webhookTime) {
  const ops = [];

  // Update the target product's own discount fields (and isHighest if applicable).
  ops.push({
    updateOne: {
      filter: { _id: targetProduct._id },
      update: {
        $set: {
          ...newFields,
          isHighest: isNewLeader,
          webhook,
          webhookTime,
        },
      },
    },
  });

  const targetDiscount = newFields.discount;
  if (isNewLeader && targetDiscount > maxDiscount) {
    // Only demote previous leader when this product is a STRICTLY new leader.
    // On a tie (targetDiscount === maxDiscount) other products may legitimately
    // share isHighest — demoting them would incorrectly remove co-leaders.
    ops.push({
      updateMany: {
        filter: { isHighest: true, _id: { $ne: targetProduct._id } },
        update: { $set: { isHighest: false } },
      },
    });
  }

  if (ops.length) {
    await Product.bulkWrite(ops, { ordered: false });
    metrics.recordDiscountSync(ops.length).catch(() => {});
  }

  return {
    bulkWriteCount: ops.length,
    syncedParentIds: [targetProduct.product?.id],
    skippedParentIds: [],
    path: "fast",
  };
}

// ---------------------------------------------------------------------------
// Main entry point called by every webhook handler.
// ---------------------------------------------------------------------------
async function syncDiscountFieldsForParentIds(parentProductIds, webhook, webhookTime) {
  const idSet = new Set((parentProductIds || []).filter(Boolean));
  if (idSet.size === 0) {
    return { bulkWriteCount: 0, syncedParentIds: [], skippedParentIds: [] };
  }

  // Fetch only the target product(s) — minimal DB read regardless of path.
  const targetProducts = await Product.find({
    "product.id": { $in: [...idSet] },
    ...eligibleDiscountProductFilter,
  })
    .select("_id product.id product.price_standard variantsData isHighest")
    .lean();

  // If the target product isn't in the DB yet (new product), fall back to full scan.
  if (targetProducts.length === 0) {
    logger.debug({ idSet: [...idSet] }, "discountSync: target not found, full scan");
    return fullScanAndSync(idSet, webhook, webhookTime);
  }

  // Compute the new discount fields for the target product(s).
  // We only handle single-product calls from webhooks (the common case).
  // Multi-product calls (batch cron) always do a full scan — handled below.
  const target = targetProducts[0];
  const newFields = computeProductDiscountFields(target);

  // Attempt to read the cached global max.
  const cachedMax = await cache.get(MAX_DISCOUNT_CACHE_KEY);

  if (cachedMax === undefined || cachedMax === null) {
    // Cache miss — must do a full scan to establish the correct max.
    logger.debug({ productId: target.product?.id }, "discountSync: cache miss, full scan");
    return fullScanAndSync(idSet, webhook, webhookTime);
  }

  const globalMax = Number(cachedMax);

  // Decide which path to take:
  //
  //   1. newDiscount > globalMax
  //      → This product is the new leader. Fast path: update this product as
  //        isHighest, demote old leader, update cached max.
  //
  //   2. newDiscount === globalMax
  //      → Ties for leader. Fast path: mark isHighest, no cache update needed.
  //
  //   3. newDiscount < globalMax AND target was NOT previously isHighest
  //      → Leaderboard unchanged. Fast path: just update this product's fields,
  //        isHighest stays false.
  //
  //   4. newDiscount < globalMax AND target WAS previously isHighest
  //      → This product just fell off the top. Must full scan to find new leader
  //        and update cached max.

  const wasLeader = target.isHighest === true;
  const newDiscount = newFields.discount;

  if (newDiscount < globalMax && wasLeader) {
    // Case 4 — leaderboard must change, full scan required.
    logger.debug({ productId: target.product?.id, newDiscount, globalMax }, "discountSync: leader dropped, full scan");
    return fullScanAndSync(idSet, webhook, webhookTime);
  }

  if (newDiscount > globalMax) {
    // Case 1 — new leader, update cached max.
    cache.set(MAX_DISCOUNT_CACHE_KEY, String(newDiscount), MAX_DISCOUNT_TTL).catch((err) => {
      logger.warn({ err: err.message, newDiscount }, 'discountSync: cache.set failed — next webhook will full-scan again');
      metrics.recordError('discountSync:cache-set', err.message).catch(() => {});
    });
  }

  const isNewLeader = newDiscount >= globalMax;

  return fastSync(target, newFields, globalMax, isNewLeader, webhook, webhookTime);
}

async function applyDiscountFieldsForParentProductId(parentProductId, webhook, webhookTime) {
  return syncDiscountFieldsForParentIds([parentProductId], webhook, webhookTime);
}

// ---------------------------------------------------------------------------
// Used by the nightly cron — always does a full scan to keep everything
// accurate, and refreshes the cached max as a side effect.
// ---------------------------------------------------------------------------
async function syncAllProductDiscounts(webhook, webhookTime) {
  const idSet = new Set(); // empty = no specific targets, all products get full fields
  return fullScanAndSync(idSet, webhook, webhookTime);
}

module.exports = {
  eligibleDiscountProductFilter,
  calculateDiscount,
  computeProductDiscountFields,
  syncDiscountFieldsForParentIds,
  applyDiscountFieldsForParentProductId,
  syncAllProductDiscounts,
};
