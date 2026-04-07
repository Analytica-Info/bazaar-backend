const axios = require("axios");
require("dotenv").config();
const Product = require("../models/Product");
const ProductId = require("../models/ProductId");
const fs = require("fs");
const API_KEY = process.env.API_KEY;
const PRODUCTS_URL = process.env.PRODUCTS_URL;

const LOG_FILE = "cron.log";

const updateProducts = async () => {
  try {
    console.log('start updateProducts');
    let products = await fetchProducts();
    products = await filterProductsByInventory(products);

    const productIds = products.map((product) => product.id);

    for (const id of productIds) {
      const existingProduct = await ProductId.findOne({ productId: id });
      if (!existingProduct) {
        await ProductId.create({ productId: id });
      }
    }

    let productIdss = await ProductId.find({}, "productId");
    productIdss = productIdss.map((item) => item.productId);

    if (productIdss.length > 0) {
      // await storeProductDetails(productIdss);
      const { storedCount, updatedCount } = await storeProductDetails(
        productIdss
      );
      return { storedCount, updatedCount };
      // console.log("Product details updated successfully.");
    } else {
      console.warn("No product IDs found.");
    }
  } catch (error) {
    console.error("Error fetching and storing product IDs:", error.message);
  }
};

// connectAndRun();
// updateProducts();

const storeProductDetails = async (productIds, res) => {
  console.log('storeProductDetails');
  try {
    let storedCount = 0; // Count of newly stored products
    let updatedCount = 0; // Count of updated products
    const totalProducts = productIds.length;
    console.log(`Starting to process ${totalProducts} products...`);

    for (const id of productIds) {
      const { product, variantsData, totalQty } = await fetchProductDetails(id);
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
        storedCount++; // Increment stored count
        // console.log(`Added new product with ID: ${product.id} - Total Stored Products: ${count}`);
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
        updatedCount++; // Increment updated count
        // console.log(`Updated product with ID: ${product.id} - Total Updated Products: ${count}`);
      }
    }

    // Log the total counts to file
    const summaryMessage = `Total New Products: ${storedCount} | Total Updated Products: ${updatedCount}\n`;
    fs.appendFileSync(LOG_FILE, summaryMessage);
    return { storedCount, updatedCount };
  } catch (error) {
    console.error("Error processing product details:", error.message);
    fs.appendFileSync(
      LOG_FILE,
      `Error processing product details: ${error.message}\n`
    );
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
      if (is_active !== true) return;
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

async function fetchProducts() {
  try {
    const allProducts = [];
    let after = "";

    do {
      let productsResponse = null;
      let retryCount = 0;
      const maxRetries = 5;
      let success = false;

      // Retry logic for 502 errors
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
          // Check if it's a 502 error
          if (error.response && error.response.status === 502) {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`502 error on request. Retrying (${retryCount}/${maxRetries}) with same version: ${after}`);
              // Wait 5 seconds before retry
              await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
              console.error(`Failed after ${maxRetries} retries with 502 error. Moving to next page.`);
              // Break out of retry loop and continue to next page
              break;
            }
          } else {
            // If it's not a 502 error, throw it
            throw error;
          }
        }
      }

      // Only process if we got a successful response
      if (success && productsResponse) {
        const products = productsResponse.data;
        if (products.data && products.data.length > 0) {
          allProducts.push(...products.data);
        }

        after = products.version?.max || "";
      } else {
        // If all retries failed, move to next page by incrementing after
        // or break if we can't continue
        console.log('Skipping this page due to repeated 502 errors');
        after = ""; // Break the loop if we can't get the next version
      }

      // Add 5 second delay before next request (except after last request)
      if (after) {
        console.log('Waiting 5 seconds before next request...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } while (after);

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

  const allInventories = [];
  let after = "";

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
  } while (after);

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

module.exports = updateProducts;

// app.listen(PORT, () => {
//     console.log(`Server is running Sucessfully on ${PORT}`);
// });
