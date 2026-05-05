const axios = require("axios");
require("dotenv").config();
const Product = require("../models/Product");
const ProductId = require("../models/ProductId");
const SyncState = require("../models/SyncState");
const cache = require("../utilities/cache");
const fs = require("fs");
const API_KEY = process.env.API_KEY;

// Must match the key in productDiscountSync.js
const MAX_DISCOUNT_CACHE_KEY = "metrics:discount:max-discount";
const MAX_DISCOUNT_TTL = require("../config/runtime").cache.maxDiscountTtl;

const LOG_FILE = "cron.log";
const SYNC_KEY_PRODUCTS_V2 = "lightspeed_products_v2";
const SYNC_KEY_SALES = "lightspeed_sales_v2";

const updateProductsNew = async () => {
  try {
    console.log("Cron Job Start (Inactive & Parked)");
    const allParkedProductIds = await filterParkProducts();
    const parkedCountResult = await updateParkedDetails(allParkedProductIds);
    const parkedCount = (typeof parkedCountResult === 'number') ? parkedCountResult : 0;
    console.log(
      "1 - Total After Filter Park Products : ",
      allParkedProductIds.length
    );
    console.log("1 - Total Updated Parked Products : ", parkedCount);

    const inactiveProductsIds = await filterActiveProducts();
    const inactiveCountResult = await updateInactiveDetails(inactiveProductsIds);
    const inactiveCount = (typeof inactiveCountResult === 'number') ? inactiveCountResult : 0;
    console.log(
      "2 - Total After Filter Active Products : ",
      inactiveProductsIds.length
    );
    console.log("2 - Total Updated Inactive Products : ", inactiveCount);

    await updateAllProductDiscounts();
    await updateSoldItems();

    return { parkedCount, inactiveCount };
  } catch (error) {
    console.error("Error fetching and storing product IDs:", error.message);
    return { parkedCount: 0, inactiveCount: 0 };
  }
};

const updateParkedDetails = async (productIds) => {
  try {
    let parkedCount = 0;

    if (!productIds || productIds.length === 0) {
      console.log("No parked products to process.");
      fs.appendFileSync(LOG_FILE, "Total Updated Products: 0\n");
      return 0;
    }

    // Batch fetch: one query to find all parent products that own any of the
    // parked variant IDs, instead of one findOne per variant (N+1 eliminated).
    const allVariantIds = productIds.map((item) => item.product);
    const batchedProducts = await Product.find({
      "variantsData.id": { $in: allVariantIds },
    })
      .select("product variantsData")
      .lean();

    // Build variant-id → parent-product map for O(1) lookups in the loop below.
    const variantToProductMap = new Map();
    for (const prod of batchedProducts) {
      for (const v of prod.variantsData || []) {
        variantToProductMap.set(v.id, prod);
      }
    }

    console.log(
      `updateParkedDetails: ${productIds.length} parked items, ${batchedProducts.length} parent products fetched in one query`
    );

    for (const id of productIds) {
      const matchedProduct = variantToProductMap.get(id.product);

      if (matchedProduct) {
        const itemId = matchedProduct.product.id;
        console.log(`Parent Parked Product Id: ${itemId}`);

        const inventoryResult = await fetchProductInventory(
          itemId,
          id.product,
          id.qty,
          id.status
        );

        // fetchProductInventory returns undefined when product is inactive.
        if (!inventoryResult) {
          console.log(
            `⚠️  Product inactive, skipping inventory update for variant ID : ${id.product} | Parent ID : ${itemId}`
          );
          continue;
        }

        const { inventoryLevel } = inventoryResult;

        const updatedVariants = matchedProduct.variantsData.map((variant) => {
          if (variant.id === id.product) {
            return { ...variant, qty: inventoryLevel };
          }
          return variant;
        });

        const totalQty = updatedVariants.reduce(
          (sum, v) => sum + (v.qty || 0),
          0
        );
        const webhook = "updateParkedDetails";
        const webhookTime = await currentTime();

        // Status (online/in-store) is owned by the product.update webhook path
        // and the initial-sync path. This is a qty-only update; overwriting
        // status here would silently re-publish in-store-only items online
        // because totalQty > 0 is not a valid proxy for ecwid_enabled_webstore.
        await Product.updateOne(
          { "product.id": itemId },
          {
            $set: {
              variantsData: updatedVariants,
              totalQty,
              webhook,
              webhookTime,
            },
          }
        );

        // Keep the in-memory snapshot current so that if another parked item
        // shares the same parent product, the next iteration starts from the
        // already-updated variantsData rather than the stale pre-fetch values.
        matchedProduct.variantsData = updatedVariants;

        console.log(
          `✅ Parked Sale Inventory Updated Product with ID : ${id.product} | Parent ID : ${itemId}`
        );
        parkedCount++;
      } else {
        console.log(
          `❌ No Parked Product found for Variant ID : ${id.product} | Quantity : ${id.qty} | Status : ${id.status}`
        );
      }
    }

    console.log(`Parked Product details processed successfully.`);
    const summaryMessage = `Total Updated Products: ${parkedCount}\n`;
    console.log(summaryMessage);
    fs.appendFileSync(LOG_FILE, summaryMessage);
    return parkedCount;
  } catch (error) {
    console.error("Error processing product details:", error.message);
    fs.appendFileSync(
      LOG_FILE,
      `Error processing product details: ${error.message}\n`
    );
    return 0;
  }
};

const updateInactiveDetails = async (productIds, res) => {
  try {
    let inactiveCount = 0;
    for (const id of productIds) {
      const response = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${id}`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );

      const productDetail = response.data.data;
      const onlineStatus = productDetail.ecwid_enabled_webstore;

      const existingProductId = await ProductId.findOne({ productId: id });
      const webhook = "updateParkedDetails";
      const webhookTime = await currentTime();
      if (existingProductId) {
        await Product.updateOne(
          { "product.id": id },
          {
            $set: {
              status: onlineStatus === true,
              webhook,
              webhookTime,
            },
          }
        );
        console.log(
          `✅ Inactive Product Details Updated Product with ID: ${id} : `
        );
        inactiveCount++;
      }
    }
    console.log(`Inactive Product details processed successfully.`);
    const summaryMessage = `Total Updated Products: ${inactiveCount}\n`;
    console.log(summaryMessage);
    fs.appendFileSync(LOG_FILE, summaryMessage);
    return inactiveCount;
  } catch (error) {
    console.error("Error processing product details:", error.message);
    fs.appendFileSync(
      LOG_FILE,
      `Error processing product details: ${error.message}\n`
    );
    return 0;
  }
};

async function filterParkProducts() {
  try {
    const productsResponse = await axios.get(
      "https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/search?type=sales&status=SAVED",
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const allSales = productsResponse.data.data || [];
    const allParkedProductIds = [];

    const parkedProductIds = new Set();

    for (const sale of allSales) {
      if (Array.isArray(sale.line_items)) {
        for (const item of sale.line_items) {
          if (item.product_id) {
            parkedProductIds.add(item.product_id);
            allParkedProductIds.push({
              product: item.product_id,
              qty: Math.floor(item.quantity),
              status: item.status,
            });
          }
        }
      }
    }

    return allParkedProductIds;
  } catch (error) {
    console.warn(
      "Error fetching park products from Lightspeed:",
      error.message
    );
    return [];
  }
}

async function filterActiveProducts() {
  const syncState = await SyncState.findOne({ key: SYNC_KEY_PRODUCTS_V2 });
  const startVersion = syncState?.lastVersion || "";

  if (startVersion) {
    console.log(`Incremental product v2 fetch from version: ${startVersion}`);
  }

  const allStoredProducts = [];
  let after = startVersion;
  let latestVersion = "";

  do {
    const inventoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products?page_size=10000&after=${after}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const inventories = inventoryResponse.data;
    if (inventories.data && inventories.data.length > 0) {
      allStoredProducts.push(...inventories.data);
    }

    after = inventories.version?.max || "";
    if (after) latestVersion = after;
  } while (after);

  if (latestVersion) {
    await SyncState.findOneAndUpdate(
      { key: SYNC_KEY_PRODUCTS_V2 },
      { lastVersion: latestVersion, lastSyncAt: new Date(), lastProductCount: allStoredProducts.length },
      { upsert: true, new: true }
    );
  }

  const inactiveProducts = allStoredProducts.filter(
    (product) => product.ecwid_enabled_webstore === false
  );

  const inactiveProductsIds = inactiveProducts.map((product) => product.id);

  console.log(
    `Found ${inactiveProductsIds.length} inactive OR webstore-disabled products (from ${allStoredProducts.length} fetched).`
  );

  return inactiveProductsIds;
}

async function updateAllProductDiscounts() {
  try {
    // Projection: only the fields used by calculateDiscount, the bulkWrite ops
    // builder, and the return $set. Drops product.variants, product.attributes,
    // product.description, product.product_codes, etc. — ~90% ingress cut.
    const products = await Product.find({
      $or: [{ status: { $exists: false } }, { status: true }],
      totalQty: { $gt: 0 },
    })
      .select("_id status totalQty variantsData product.id product.price_standard")
      .lean();

    if (products.length === 0) return;

    // Compute discounts in parallel (no DB calls in calculateDiscount)
    const productsWithDiscounts = await Promise.all(
      products.map(async (product) => {
        const discount = await calculateDiscount(product);
        return { ...product, discount };
      })
    );

    const maxDiscount = Math.max(
      ...productsWithDiscounts.map((p) => p.discount || 0)
    );

    // Refresh the cached global max so post-cron webhooks can skip full scans.
    cache.set(MAX_DISCOUNT_CACHE_KEY, String(maxDiscount), MAX_DISCOUNT_TTL).catch(() => {});

    // Single snapshot of the timestamp for the entire batch — avoids
    // N async calls to currentTime() inside the hot loop and means every
    // product updated in this run carries an identical webhookTime.
    const webhook = "updateProductDiscounts";
    const webhookTime = await currentTime();

    // Build all operations for a single bulkWrite roundtrip.
    // Was: N individual updateOne awaits (one Mongo roundtrip each).
    // Now: 1 unordered bulkWrite (one roundtrip; ops applied in parallel on the server).
    const ops = productsWithDiscounts.map((product) => {
      const taxInclusive = parseFloat(product.product.price_standard?.tax_inclusive) || 0;
      const fallbackPrice = product.variantsData?.[0]?.price
        ? parseFloat(product.variantsData[0].price)
        : 0;
      const basePrice = taxInclusive > 0 ? taxInclusive : fallbackPrice;
      const originalPrice = basePrice > 0 ? Number((basePrice / 0.65).toFixed(2)) : 0;

      let highestDiscountPercentage = 0;
      let highestDiscountVariant = null;
      if (product.variantsData && product.variantsData.length > 0) {
        product.variantsData.forEach((variant) => {
          const discountPercentage = originalPrice > 0
            ? Number((((originalPrice - variant.price) / originalPrice) * 100).toFixed(2))
            : 0;

          if (discountPercentage > highestDiscountPercentage) {
            highestDiscountPercentage = discountPercentage;
            highestDiscountVariant = variant;
          }
        });
      }

      return {
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              discount: product.discount,
              isHighest: product.discount === maxDiscount,
              originalPrice: originalPrice,
              discountedPrice: highestDiscountVariant?.price || fallbackPrice || 0,
              webhook,
              webhookTime,
            },
          },
        },
      };
    });

    // MongoDB limits individual bulkWrite payloads; chunk if the batch grows
    // beyond ~1000 ops to keep each BSON payload well under the 100 MB cap.
    const CHUNK = 1000;
    let modifiedTotal = 0;
    let matchedTotal = 0;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const slice = ops.slice(i, i + CHUNK);
      const res = await Product.bulkWrite(slice, { ordered: false });
      modifiedTotal += res.modifiedCount || 0;
      matchedTotal += res.matchedCount || 0;
    }

    console.log(
      `[updateAllProductDiscounts] bulkWrite: ops=${ops.length} matched=${matchedTotal} modified=${modifiedTotal}`
    );
  } catch (err) {
    console.error("❌ Error updating discounts:", err);
  }
}

async function updateSoldItems() {
  try {
    const saleItems = await getSalesItem();
    const soldCounts = {};
    for (const sale of saleItems) {
      if (!sale.line_items || sale.line_items.length === 0) continue;

      for (const item of sale.line_items) {
        const productId = item.product_id?.toString();
        const qty = item.quantity || 0;

        if (!productId) continue;

        if (!soldCounts[productId]) {
          soldCounts[productId] = 0;
        }
        soldCounts[productId] += qty;
      }
    }

    // Batch fetch all sold products in one query, then bulk-write all updates.
    // Previous pattern: 2 DB roundtrips per sold variant (find + updateOne).
    const soldVariantIds = Object.keys(soldCounts);
    const soldProducts = await Product.find({
      "variantsData.id": { $in: soldVariantIds },
    }).select("_id totalQty variantsData").lean();

    const bulkOps = [];
    for (const product of soldProducts) {
      // Sum sold qty across ALL variants of this product, not just the first
      // matching one. Array.find would stop at the first variant with sales and
      // undercount multi-variant products where several variants were sold.
      const soldQty = (product.variantsData || []).reduce(
        (sum, v) => sum + (soldCounts[v.id] || 0),
        0
      );

      if (!soldQty) continue;

      const safeSoldQty =
        soldQty && typeof soldQty === "number" && soldQty > 0 ? soldQty : 0;

      bulkOps.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: { sold: safeSoldQty } },
        },
      });
    }

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps, { ordered: false });
    }

    console.log("🎉 All sold products updated successfully");
  } catch (err) {
    console.error("❌ Error updating sold items:", err);
  }
}

async function getSalesItem() {
  const syncState = await SyncState.findOne({ key: SYNC_KEY_SALES });
  const startVersion = syncState?.lastVersion || "";

  if (startVersion) {
    console.log(`Incremental sales fetch from version: ${startVersion}`);
  }

  const saleItems = [];
  let after = startVersion;
  let latestVersion = "";

  do {
    const salesResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/sales?page_size=5000&after=${after}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const data = salesResponse.data;
    if (data.data && data.data.length > 0) {
      saleItems.push(...data.data);
    }

    after = data.version?.max || "";
    if (after) latestVersion = after;
  } while (after);

  if (latestVersion) {
    await SyncState.findOneAndUpdate(
      { key: SYNC_KEY_SALES },
      { lastVersion: latestVersion, lastSyncAt: new Date(), lastProductCount: saleItems.length },
      { upsert: true, new: true }
    );
  }

  return saleItems;
}

const fetchProductInventory = async (id, inventoryId, qty, status) => {
  try {
    const response = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    let product = response.data.data;
    if (!product) throw new Error("Product not found.");

    const inventoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${inventoryId}/inventory`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const is_active = product.is_active;
    if (is_active !== true) return;

    let inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
    if (status === "SAVED") {
      inventoryLevel = Math.max(inventoryLevel - qty, 0);
    }

    return { inventoryLevel };
  } catch (error) {
    console.error(
      `Error fetching product details for ID: ${id}`,
      error.message
    );
    throw error;
  }
};

const currentTime = async () => {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const parts = formatter.formatToParts(date);

  let hour = "",
    minute = "",
    second = "",
    period = "",
    day = "",
    month = "",
    year = "";

  parts.forEach((part) => {
    switch (part.type) {
      case "hour":
        hour = part.value;
        break;
      case "minute":
        minute = part.value;
        break;
      case "second":
        second = part.value;
        break;
      case "dayPeriod":
        period = part.value;
        break;
      case "day":
        day = part.value;
        break;
      case "month":
        month = part.value;
        break;
      case "year":
        year = part.value;
        break;
    }
  });

  const timeFormatted = `${hour}:${minute}:${second} ${period.toUpperCase()} - ${day} ${month}, ${year}`;
  return timeFormatted;
};

const calculateDiscount = (product) => {
  const taxInclusive = parseFloat(product.product?.price_standard?.tax_inclusive) || 0;
  const fallbackPrice = product.variantsData?.[0]?.price ? parseFloat(product.variantsData[0].price) : 0;
  const basePrice = taxInclusive > 0 ? taxInclusive : fallbackPrice;
  const originalPrice = basePrice > 0 ? Math.round(basePrice / 0.65) : 0;

  if (originalPrice <= 0) return 0;

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
};

module.exports = updateProductsNew;
module.exports.updateParkedDetails = updateParkedDetails;
module.exports.updateSoldItems = updateSoldItems;
