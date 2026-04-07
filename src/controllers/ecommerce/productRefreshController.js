const axios = require('axios');
const Product = require('../../models/Product');
const ProductId = require('../../models/ProductId');

const API_KEY = process.env.API_KEY;

function getCurrentTime() {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat('en-AE', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  let hour = '', minute = '', second = '', period = '', day = '', month = '', year = '';
  parts.forEach((part) => {
    if (part.type === 'hour') hour = part.value;
    else if (part.type === 'minute') minute = part.value;
    else if (part.type === 'second') second = part.value;
    else if (part.type === 'dayPeriod') period = part.value;
    else if (part.type === 'day') day = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'year') year = part.value;
  });
  return `${hour}:${minute}:${second} ${period.toUpperCase()} - ${day} ${month}, ${year}`;
}

/**
 * Same logic as updateProducts.js fetchProductDetails: fetch from Lightspeed, build variantsData + totalQty.
 */
async function fetchProductDetails(id) {
  console.log('[Refresh Product] Hitting Lightspeed API: GET /api/3.0/products/' + id);
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
    console.log('[Refresh Product] Hitting Lightspeed API: GET /api/2.0/products/' + id + '/inventory');
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
    console.log('[Refresh Product] Price from API (product, no variants) — tax_exclusive:', ps.tax_exclusive, '| tax_inclusive:', ps.tax_inclusive, '| storing price:', price);
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
    for (const variant of product.variants) {
      if (variant.is_active !== true) continue;
      const variantId = variant.id;
      const pv = variant.price_standard || {};
      const variantPrice = pv.tax_inclusive ?? pv.tax_exclusive;
      const variantDefinitions = variant.variant_definitions;
      let sku = '';
      if (variantDefinitions && variantDefinitions.length > 0) {
        sku = variantDefinitions.map((d) => d.value).join(' - ');
      }
      console.log('[Refresh Product] Hitting Lightspeed API: GET /api/2.0/products/' + variantId + '/inventory');
      const inventoryResponse = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: 'application/json',
          },
        }
      );
      const inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
      console.log('[Refresh Product] Price from API (variant)', variantId, '— tax_exclusive:', pv.tax_exclusive, '| tax_inclusive:', pv.tax_inclusive, '| storing price:', variantPrice);
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
    }
  }

  console.log('[Refresh Product] variantsData we are storing:', JSON.stringify(variantsData.map((v) => ({ id: v.id, sku: v.sku, price: v.price, qty: v.qty }))));
  return { product, variantsData, totalQty };
}

/**
 * Refresh a single product by Lightspeed product ID (same as product.id in Product table).
 * Same logic as updateProducts.js: fetch from Lightspeed, then create or update in MongoDB.
 * ID can be sent via: Header (X-Lightspeed-Product-Id or x-product-id), Query (?productId=), or Body ({ productId }).
 */
exports.refreshSingleProductById = async (req, res) => {
  try {
    const productId =
      req.headers['x-lightspeed-product-id'] ||
      req.headers['x-product-id'] ||
      req.query.productId ||
      req.body?.productId;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required. Send via header (X-Lightspeed-Product-Id or X-Product-Id), query (?productId=), or body ({ productId }).',
      });
    }

    const id = productId;
    console.log('[Refresh Product] Requested productId:', id);

    const existingProductId = await ProductId.findOne({ productId: id });
    if (!existingProductId) {
      await ProductId.create({ productId: id });
      console.log('[Refresh Product] ProductId was missing in DB — created.');
    } else {
      console.log('[Refresh Product] ProductId already in ProductId collection.');
    }

    const { product, variantsData, totalQty } = await fetchProductDetails(id);
    const timeFormatted = getCurrentTime();
    const type = 'api';
    const productStatus = totalQty > 0;

    const existingEntry = await Product.findOne({ 'product.id': product.id });
    if (existingEntry) {
      console.log('[Refresh Product] Product already exists in DB (product.id=' + product.id + '). Will update.');
    } else {
      console.log('[Refresh Product] Product not in DB. Will create new.');
    }

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
      console.log('[Refresh Product] Created in MongoDB. product.id:', product.id);
      const doc = newProductDetails.toObject ? newProductDetails.toObject() : newProductDetails;
      return res.status(200).json({
        success: true,
        message: 'Product created in MongoDB.',
        created: true,
        productId: product.id,
        product: doc,
      });
    }

    await Product.updateOne(
      { 'product.id': product.id },
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
    console.log('[Refresh Product] Updated in MongoDB. product.id:', product.id);
    const updated = await Product.findOne({ 'product.id': product.id }).lean();

    return res.status(200).json({
      success: true,
      message: 'Product updated in MongoDB.',
      updated: true,
      productId: product.id,
      product: updated,
    });
  } catch (error) {
    console.error('refreshSingleProductById error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to refresh product',
    });
  }
};
