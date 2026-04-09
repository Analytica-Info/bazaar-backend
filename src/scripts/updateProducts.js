const axios = require("axios");
require("dotenv").config();
const Product = require("../models/Product");
const ProductId = require("../models/ProductId");
const SyncState = require("../models/SyncState");
const fs = require("fs");
const API_KEY = process.env.API_KEY;
const PRODUCTS_URL = process.env.PRODUCTS_URL;

const LOG_FILE = "cron.log";
const SYNC_KEY_PRODUCTS = "lightspeed_products_v3";
const SYNC_KEY_INVENTORY = "lightspeed_inventory_v2";

const updateProducts = async () => {
  try {
    console.log('start updateProducts (incremental)');

    // Get last sync version
    const syncState = await SyncState.findOne({ key: SYNC_KEY_PRODUCTS });
    const lastVersion = syncState?.lastVersion || "";

    if (lastVersion) {
      console.log(`Incremental sync from version: ${lastVersion}`);
    } else {
      console.log('Full sync (first run or reset)');
    }

    let products = await fetchProducts(lastVersion);

    if (products.length === 0) {
      console.log('No new/updated products since last sync');
      return { storedCount: 0, updatedCount: 0 };
    }

    console.log(`Fetched ${products.length} changed products`);
    products = await filterProductsByInventory(products);

    const productIds = products.map((product) => product.id);

    for (const id of productIds) {
      const existingProduct = await ProductId.findOne({ productId: id });
      if (!existingProduct) {
        await ProductId.create({ productId: id });
      }
    }

    // Only process the changed product IDs, not all
    if (productIds.length > 0) {
      const { storedCount, updatedCount } = await storeProductDetails(productIds);
      return { storedCount, updatedCount };
    } else {
      console.warn("No product IDs to process after inventory filter.");
      return { storedCount: 0, updatedCount: 0 };
    }
  } catch (error) {
    console.error("Error fetching and storing product IDs:", error.message);
    return { storedCount: 0, updatedCount: 0 };
  }
};

const storeProductDetails = async (productIds) => {
  console.log('storeProductDetails');
  try {
    let storedCount = 0;
    let updatedCount = 0;
    const totalProducts = productIds.length;
    console.log(`Starting to process ${totalProducts} products...`);

    for (const id of productIds) {
      try {
        const result = await fetchProductDetails(id);
        if (!result) continue; // inactive product

        const { product, variantsData, totalQty } = result;
        const timeFormatted = await currentTime();
        const type = "cron";

        const existingEntry = await Product.findOne({ "product.id": product.id });
        const productStatus = totalQty > 0 ? true : false;

        if (!existingEntry) {
          const newProductDetails = new Product({
            product,
            variantsData,
            totalQty,
            webhook: type,
            webhookTime: timeFormatted,
            status: productStatus,
          });
          await newProductDetails.save();
          storedCount++;
        } else {
          await Product.updateOne(
            { "product.id": product.id },
            {
              $set: {
                product,
                variantsData,
                totalQty,
                webhook: type,
                webhookTime: timeFormatted,
                status: productStatus,
              },
            }
          );
          updatedCount++;
        }
      } catch (err) {
        console.error(`Error processing product ${id}:`, err.message);
        // Continue with next product instead of failing entire batch
      }
    }

    const summaryMessage = `Total New Products: ${storedCount} | Total Updated Products: ${updatedCount}\n`;
    fs.appendFileSync(LOG_FILE, summaryMessage);
    return { storedCount, updatedCount };
  } catch (error) {
    console.error("Error processing product details:", error.message);
    fs.appendFileSync(LOG_FILE, `Error processing product details: ${error.message}\n`);
    return { storedCount: 0, updatedCount: 0 };
  }
};

const fetchProductDetails = async (id) => {
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

    const variantsData = [];
    let totalQty = 0;

    if (product.variants.length === 0) {
      const inventoryResponse = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${id}/inventory`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );
      const is_active = product.is_active;
      if (is_active !== true) return null;
      const inventoryLevel =
        inventoryResponse.data.data?.[0]?.inventory_level || 0;

      if (
        inventoryLevel > 0 &&
        parseFloat(product.price_standard.tax_inclusive) !== 0
      ) {
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
      for (const variant of product.variants) {
        const is_active = variant.is_active;
        if (is_active !== true) continue;
        const variantId = variant.id;
        const variantPrice = variant.price_standard.tax_inclusive;
        const variantDefinitions = variant.variant_definitions;
        let sku = "";
        if (variantDefinitions && variantDefinitions.length > 0) {
          const values = variantDefinitions.map((def) => def.value);
          sku = values.join(" - ");
        }
        const inventoryResponse = await axios.get(
          `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: "application/json",
            },
          }
        );
        const inventoryLevel =
          inventoryResponse.data.data?.[0]?.inventory_level || 0;

        if (inventoryLevel > 0 && parseFloat(variantPrice) !== 0) {
          variantsData.push({
            qty: inventoryLevel,
            sku: sku,
            price: variantPrice,
            id: variantId,
            name: variant.name,
          });
          totalQty += inventoryLevel;
        }
      }
    }
    return { product, variantsData, totalQty };
  } catch (error) {
    console.error(
      `Error fetching product details for ID: ${id}`,
      error.message
    );
    throw error;
  }
};

/**
 * Fetch products from Lightspeed API v3.0
 * Uses since_version for incremental sync — only fetches products changed since last run.
 * On first run (no lastVersion), fetches everything.
 */
async function fetchProducts(startVersion) {
  try {
    const allProducts = [];
    let after = startVersion || "";
    let latestVersion = "";

    do {
      let productsResponse = null;
      let retryCount = 0;
      const maxRetries = 5;
      let success = false;

      while (retryCount < maxRetries && !success) {
        try {
          productsResponse = await axios.get(
            `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products?page_size=300&since_version=${after}`,
            {
              headers: {
                Authorization: `Bearer ${API_KEY}`,
                Accept: "application/json",
              },
            }
          );
          success = true;
        } catch (error) {
          if (error.response && error.response.status === 502) {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`502 error on request. Retrying (${retryCount}/${maxRetries}) with same version: ${after}`);
              await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
              console.error(`Failed after ${maxRetries} retries with 502 error. Moving to next page.`);
              break;
            }
          } else {
            throw error;
          }
        }
      }

      if (success && productsResponse) {
        const products = productsResponse.data;
        if (products.data && products.data.length > 0) {
          allProducts.push(...products.data);
        }

        after = products.version?.max || "";
        if (after) latestVersion = after;
      } else {
        console.log('Skipping this page due to repeated 502 errors');
        after = "";
      }

      if (after) {
        console.log('Waiting 5 seconds before next request...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } while (after);

    // Save the latest version for next incremental sync
    if (latestVersion) {
      await SyncState.findOneAndUpdate(
        { key: SYNC_KEY_PRODUCTS },
        {
          lastVersion: latestVersion,
          lastSyncAt: new Date(),
          lastProductCount: allProducts.length,
        },
        { upsert: true, new: true }
      );
      console.log(`Saved sync version: ${latestVersion} (${allProducts.length} products)`);
    }

    const activeProducts = allProducts.filter(
      (product) => product.is_active === true
    );

    return activeProducts;
  } catch (error) {
    console.log('error', error);
    console.warn("Error fetching products from Lightspeed:", error.message);
    return [];
  }
}

async function filterProductsByInventory(productsResponse) {
  const allProducts = productsResponse || [];

  // Get last inventory sync version
  const inventorySync = await SyncState.findOne({ key: SYNC_KEY_INVENTORY });
  const inventoryStartVersion = inventorySync?.lastVersion || "";

  const allInventories = [];
  let after = inventoryStartVersion;
  let latestInventoryVersion = "";

  do {
    const inventoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/inventory?page_size=5000&after=${after}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const inventories = inventoryResponse.data;
    if (inventories.data && inventories.data.length > 0) {
      allInventories.push(...inventories.data);
    }

    after = inventories.version?.max || "";
    if (after) latestInventoryVersion = after;
  } while (after);

  // Save inventory version
  if (latestInventoryVersion) {
    await SyncState.findOneAndUpdate(
      { key: SYNC_KEY_INVENTORY },
      {
        lastVersion: latestInventoryVersion,
        lastSyncAt: new Date(),
        lastProductCount: allInventories.length,
      },
      { upsert: true, new: true }
    );
  }

  // If no inventory data fetched (incremental returned nothing), fetch full for matching
  // This handles the case where products changed but inventory didn't
  if (allInventories.length === 0 && allProducts.length > 0) {
    console.log('No incremental inventory changes — fetching full inventory for product matching');
    let fullAfter = "";
    do {
      const inventoryResponse = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/inventory?page_size=5000&after=${fullAfter}`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );
      const inventories = inventoryResponse.data;
      if (inventories.data && inventories.data.length > 0) {
        allInventories.push(...inventories.data);
      }
      fullAfter = inventories.version?.max || "";
    } while (fullAfter);
  }

  const filteredProducts = [];

  for (const product of allProducts) {
    let totalQty = 0;

    if (product.variants && product.variants.length > 0) {
      product.variants = product.variants.filter((variant) => {
        let variantQty = 0;
        for (const inventory of allInventories) {
          if (inventory.product_id === variant.id) {
            variantQty += inventory.inventory_level;
          }
        }
        return variantQty > 0;
      });

      product.variants.forEach((variant) => {
        let variantQty = 0;
        for (const inventory of allInventories) {
          if (inventory.product_id === variant.id) {
            variantQty += inventory.inventory_level;
          }
        }
        totalQty += variantQty;
      });
    } else {
      for (const inventory of allInventories) {
        if (inventory.product_id === product.id) {
          totalQty += inventory.inventory_level;
        }
      }
    }

    if (totalQty > 0) {
      product.qty = totalQty;
      filteredProducts.push(product);
    }
  }

  return filteredProducts;
}

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
      case "hour": hour = part.value; break;
      case "minute": minute = part.value; break;
      case "second": second = part.value; break;
      case "dayPeriod": period = part.value; break;
      case "day": day = part.value; break;
      case "month": month = part.value; break;
      case "year": year = part.value; break;
    }
  });

  const timeFormatted = `${hour}:${minute}:${second} ${period.toUpperCase()} - ${day} ${month}, ${year}`;
  return timeFormatted;
};

module.exports = updateProducts;
