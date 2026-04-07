const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const JWT_SECRET = require("../../config/jwtSecret");
const axios = require("axios");
const Product = require("../../models/Product");
const ProductId = require("../../models/ProductId");
const mongoose = require("mongoose");
const {
  applyDiscountFieldsForParentProductId,
} = require("../../helpers/productDiscountSync");
const API_KEY = process.env.API_KEY;
const PRODUCTS_URL = process.env.PRODUCTS_URL;
const processedProductIds = new Set();

exports.inventoryUpdate = async (req, res) => {
  try {
    const { payload, type } = req.body;

    if (!payload) {
      console.log("No payload received");
      return res.status(400).send({ error: "No payload received" });
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch (err) {
      console.log("Invalid JSON in payload");
      return res.status(400).send({ error: "Invalid JSON in payload" });
    }

    const productId = parsedPayload?.id;
    const updateProduct = parsedPayload?.product;
    const updateProductId = updateProduct.variant_parent_id
      ? updateProduct.variant_parent_id
      : updateProduct.id;

    if (!productId) {
      console.log("No product ID in payload");
      return res.status(400).send({ error: "Missing product ID" });
    }

    const timeFormatted = await currentTime();
    console.log(
      `🕒 ${timeFormatted} ${type} - Received Inventory Update for ID : ${updateProductId}`
    );
    // console.log(type, " : parsedPayload:", JSON.stringify(parsedPayload, null, 2));

    const allParkedProductIds = await filterParkProducts();
    console.log("All Parked ProductIds : ", allParkedProductIds.length);
    const result = await getMatchingProductIds(
      updateProductId,
      allParkedProductIds
    );
    console.log("Matched Product IDs:", result);
    let itemId;
    if (result.length > 0) {
      itemId = result[0].product;
    } else {
      itemId = updateProductId;
    }

    const matchedProductIds = [];

    for (const item of allParkedProductIds) {
      const matchedParentProduct = await Product.findOne({
        "variantsData.id": item.product,
      });

      if (matchedParentProduct && matchedParentProduct.product?.id) {
        const matchedVariant = matchedParentProduct.variantsData.find(
          (variant) => variant.id === item.product
        );

        if (matchedVariant) {
          matchedProductIds.push({
            product: matchedVariant.id,
            qty: Math.floor(item.qty),
          });
        }
      }
    }

    console.log("Matched Parent Product IDs:", matchedProductIds);

    const { variantsData, totalQty } = await fetchProductInventoryDetails(
      itemId,
      matchedProductIds
    );
    const webhook = type;
    const webhookTime = timeFormatted;
    await Product.updateOne(
      { "product.id": itemId },
      { $set: { variantsData, totalQty, webhook, webhookTime } }
    );
    console.log(`✅ Inventory Updated Product with ID : ${itemId} : `, type);

    try {
      await applyDiscountFieldsForParentProductId(itemId, type, timeFormatted);
    } catch (discountErr) {
      console.error(
        "inventoryUpdate discount sync failed:",
        discountErr.message
      );
    }

    return res.status(200).send({ success: true });
  } catch (error) {
    console.log("Server error:", error);
    return res.status(500).send({ error: "Internal Server Error" });
  }
};

exports.saleUpdate = async (req, res) => {
  try {
    const { payload, type } = req.body;

    if (!payload) {
      console.log("No payload received");
      return res.status(400).send({ error: "No payload received" });
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch (err) {
      console.log("Invalid JSON in payload");
      return res.status(400).send({ error: "Invalid JSON in payload" });
    }

    const productId = parsedPayload?.id;
    const saleProduct = JSON.stringify(
      parsedPayload?.register_sale_products,
      null,
      2
    );
    const updateProductId = parsedPayload.register_sale_products[0].product_id;
    const updateProductQty = parsedPayload.register_sale_products[0].quantity;
    const updateProductStatus = parsedPayload.status;

    if (!productId) {
      console.log("No product ID in payload");
      return res.status(400).send({ error: "Missing product ID" });
    }

    const timeFormatted = await currentTime();
    console.log(
      `🕒 ${timeFormatted} ${type} - Received Parked Product ID : ${updateProductId} | Quantity : ${updateProductQty} | Status : ${updateProductStatus}`
    );
    // console.log(type, " : parsedPayload:", JSON.stringify(parsedPayload, null, 2));

    const matchedProduct = await Product.findOne({
      "variantsData.id": updateProductId,
    });

    if (matchedProduct) {
      console.log(`Parent Parked Product Id: ${matchedProduct.product.id}`);
      const itemId = matchedProduct.product.id;
      const existingProductId = await ProductId.findOne({ productId: itemId });
      const productDoc = await Product.findOne({ "product.id": itemId });
      if (productDoc) {
        const { inventoryLevel } = await fetchProductInventory(
          itemId,
          updateProductId,
          updateProductQty,
          updateProductStatus
        );
        const updatedVariants = productDoc.variantsData.map((variant) => {
          if (variant.id === updateProductId) {
            return {
              ...variant,
              qty: inventoryLevel,
            };
          }
          return variant;
        });

        const totalQty = updatedVariants.reduce(
          (sum, v) => sum + (v.qty || 0),
          0
        );
        const webhook = type;
        const webhookTime = timeFormatted;

        await Product.updateOne(
          { "product.id": itemId },
          {
            $set: {
              variantsData: updatedVariants,
              totalQty: totalQty,
              webhook: webhook,
              webhookTime: webhookTime,
            },
          }
        );

        console.log(
          `✅ Parked Sale Inventory Updated Product with ID : ${updateProductId} : `,
          type
        );

        try {
          await applyDiscountFieldsForParentProductId(
            itemId,
            type,
            timeFormatted
          );
        } catch (discountErr) {
          console.error(
            "saleUpdate discount sync failed:",
            discountErr.message
          );
        }
      }
    } else {
      console.log(
        `❌ No Parked Product found for Variant ID : ${updateProductId} | Quantity : ${updateProductQty} | Status : ${updateProductStatus}`
      );
    }

    return res.status(200).send({ success: true });
  } catch (error) {
    console.log("Server error:", error);
    return res.status(500).send({ error: "Internal Server Error" });
  }
};

exports.productUpdate = async (req, res) => {
  try {
    const { payload, type } = req.body;

    if (!payload) {
      console.log("No payload received");
      return res.status(400).send({ error: "No payload received" });
    }

    let parsedPayload;
    try {
      parsedPayload = JSON.parse(payload);
    } catch (err) {
      console.log("Invalid JSON in payload");
      return res.status(400).send({ error: "Invalid JSON in payload" });
    }

    const productId = parsedPayload?.id;
    const updateProduct = parsedPayload;
    const updateProductId = updateProduct.variant_parent_id
      ? updateProduct.variant_parent_id
      : updateProduct.id;

    if (processedProductIds.has(updateProductId)) {
      console.log(
        `⚠️  Skipping Duplicate Update Product Id : ${updateProductId}`
      );
      return res.status(200).send({ message: "Duplicate update skipped" });
    }

    processedProductIds.add(updateProductId);
    setTimeout(() => processedProductIds.delete(updateProductId), 5000);

    if (!productId) {
      console.log("No product ID in payload");
      return res.status(400).send({ error: "Missing product ID" });
    }

    const timeFormatted = await currentTime();
    console.log(
      `🕒 ${timeFormatted} ${type} - Received Product Update for ID : ${updateProductId}`
    );
    // console.log(type, " : parsedPayload:", JSON.stringify(parsedPayload, null, 2));

    const response = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${updateProductId}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const productDetail = response.data.data;
    const onlineStatus = productDetail.ecwid_enabled_webstore;

    const existingProductId = await ProductId.findOne({
      productId: updateProductId,
    });
    const webhook = type;
    const webhookTime = timeFormatted;
    if (existingProductId) {
      const { product } = await fetchProductDetails(updateProductId, 0);
      await Product.updateOne(
        { "product.id": product.id },
        {
          $set: {
            product,
            status: onlineStatus === true,
            webhook,
            webhookTime,
          },
        }
      );
      console.log(
        `✅ Product Details Updated Product with ID: ${product.id} : `,
        type
      );
    }

    const parentProductId = await inventoryProductDetailUpdate(
      type,
      updateProductId,
      timeFormatted
    );
    try {
      await applyDiscountFieldsForParentProductId(
        parentProductId,
        type,
        timeFormatted
      );
    } catch (discountErr) {
      console.error(
        "product.update discount sync failed:",
        discountErr.message
      );
    }

    return res.status(200).send({ success: true });
  } catch (error) {
    console.log("Server error:", error);
    return res.status(500).send({ error: "Internal Server Error" });
  }
};

const fetchProductDetails = async (id, qty) => {
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

      let inventoryLevel =
        inventoryResponse.data.data?.[0]?.inventory_level || 0;
      inventoryLevel = Math.max(inventoryLevel - qty, 0);

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

        let inventoryLevel =
          inventoryResponse.data.data?.[0]?.inventory_level || 0;
        if (variantId === id) {
          inventoryLevel = Math.max(inventoryLevel - qty, 0);
        }

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
    console.log("Inventory Id", inventoryId);
    console.log("Status", status);
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

const fetchProductInventoryDetails = async (itemId, matchedProductIds = []) => {
  try {
    const response = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${itemId}`,
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

    const getMatchedQty = (variantId) => {
      const match = matchedProductIds.find((v) => v.product === variantId);
      return match ? Math.floor(match.qty) : 0;
    };

    if (product.variants.length === 0) {
      const inventoryResponse = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${itemId}/inventory`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );

      const is_active = product.is_active;
      if (is_active !== true) return;

      const matchedQty = getMatchedQty(product.id);
      let inventoryLevel =
        inventoryResponse.data.data?.[0]?.inventory_level || 0;
      inventoryLevel = Math.max(inventoryLevel - matchedQty, 0);

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
        if (!variant.is_active) continue;

        const variantId = variant.id;
        const matchedQty = getMatchedQty(variantId);
        const variantPrice = variant.price_standard.tax_inclusive;

        const variantDefinitions = variant.variant_definitions;
        let sku = "";
        if (variantDefinitions?.length) {
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

        let inventoryLevel =
          inventoryResponse.data.data?.[0]?.inventory_level || 0;
        inventoryLevel = Math.max(inventoryLevel - matchedQty, 0);

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
      }
    }

    return { product, variantsData, totalQty };
  } catch (error) {
    console.error(
      `Error fetching product details for ID: ${itemId}`,
      error.message
    );
    throw error;
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

const getMatchingProductIds = async (
  updateProductId,
  allParkedProductIds,
  res
) => {
  const matchingProductIds = [];
  const seenProductIds = new Set();

  for (const item of allParkedProductIds) {
    const variantId = item.product;

    if (variantId === updateProductId) {
      const productId = updateProductId;

      if (!seenProductIds.has(productId)) {
        matchingProductIds.push({
          product: productId,
          qty: Math.floor(item.qty),
        });
        seenProductIds.add(productId);
      }
    }
  }

  return matchingProductIds;
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

const inventoryProductDetailUpdate = async (
  type,
  updateProductId,
  timeFormatted
) => {
  const allParkedProductIds = await filterParkProducts();
  const result = await getMatchingProductIds(
    updateProductId,
    allParkedProductIds
  );
  let itemId;
  if (result.length > 0) {
    itemId = result[0].product;
  } else {
    itemId = updateProductId;
  }

  const matchedProductIds = [];

  for (const item of allParkedProductIds) {
    const matchedParentProduct = await Product.findOne({
      "variantsData.id": item.product,
    });

    if (matchedParentProduct && matchedParentProduct.product?.id) {
      const matchedVariant = matchedParentProduct.variantsData.find(
        (variant) => variant.id === item.product
      );

      if (matchedVariant) {
        matchedProductIds.push({
          product: matchedVariant.id,
          qty: Math.floor(item.qty),
        });
      }
    }
  }

  const { variantsData, totalQty } = await fetchProductInventoryDetails(
    itemId,
    matchedProductIds
  );
  const status = totalQty === 0 ? false : true;
  const webhook = type;
  const webhookTime = timeFormatted;
  await Product.updateOne(
    {
      "product.id": itemId,
      status: true,
    },
    { $set: { variantsData, totalQty, status, webhook, webhookTime } }
  );
  console.log(
    `✅ Inventory Updated (Product Update) Product with ID : ${itemId} : `,
    type
  );
  return itemId;
};
