const axios = require('axios');
const Product = require('../models/Product');
const ProductId = require('../models/ProductId');
const logger = require("../utilities/logger");
const {
    applyDiscountFieldsForParentProductId,
    syncDiscountFieldsForParentIds,
} = require('../helpers/productDiscountSync');

const API_KEY = process.env.API_KEY;
const WEBHOOK_PRODUCT_UPDATE = 'product.update';
const WEBHOOK_AFTER_SYNC = 'updateProductDiscounts';

// In-memory dedup set for product updates (same as original controller)
const processedProductIds = new Set();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * When Lightspeed parent has tax_inclusive=0 but variants have real prices,
 * patch the product object so frontend displays the correct price.
 */
function fixZeroTaxInclusive(product, variantsData) {
    const taxIncl = parseFloat(product.price_standard?.tax_inclusive) || 0;
    if (taxIncl === 0 && variantsData.length > 0) {
        const firstVariantPrice = parseFloat(variantsData[0].price) || 0;
        if (firstVariantPrice > 0) {
            product.price_standard.tax_inclusive = firstVariantPrice;
            product.price_standard.tax_exclusive = (firstVariantPrice / 1.05).toFixed(5);
        }
    }
}

// ---------------------------------------------------------------------------
// Lightspeed API helpers
// ---------------------------------------------------------------------------

async function currentTime() {
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

    parts.forEach(part => {
        switch (part.type) {
            case 'hour': hour = part.value; break;
            case 'minute': minute = part.value; break;
            case 'second': second = part.value; break;
            case 'dayPeriod': period = part.value; break;
            case 'day': day = part.value; break;
            case 'month': month = part.value; break;
            case 'year': year = part.value; break;
        }
    });

    return `${hour}:${minute}:${second} ${period.toUpperCase()} - ${day} ${month}, ${year}`;
}

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
        console.warn('Error fetching park products from Lightspeed:', error.message);
        return [];
    }
}

function getMatchingProductIds(updateProductId, allParkedProductIds) {
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
}

async function fetchProductDetails(id, qty) {
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
        if (is_active !== true) return { product, variantsData, totalQty };

        let inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
        inventoryLevel = Math.max(inventoryLevel - qty, 0);

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
        for (const variant of product.variants) {
            const is_active = variant.is_active;
            if (is_active !== true) continue;
            const variantId = variant.id;
            const variantPrice = variant.price_standard.tax_inclusive;
            const variantDefinitions = variant.variant_definitions;
            let sku = '';
            if (variantDefinitions && variantDefinitions.length > 0) {
                sku = variantDefinitions.map(def => def.value).join(' - ');
            }
            const inventoryResponse = await axios.get(
                `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
                {
                    headers: {
                        Authorization: `Bearer ${API_KEY}`,
                        Accept: 'application/json',
                    },
                }
            );

            let inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
            if (variantId === id) {
                inventoryLevel = Math.max(inventoryLevel - qty, 0);
            }

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
    console.log('Inventory Id', inventoryId);
    console.log('Status', status);
    if (status === 'SAVED') {
        inventoryLevel = Math.max(inventoryLevel - qty, 0);
    }

    return { inventoryLevel };
}

async function fetchProductInventoryDetails(itemId, matchedProductIds = []) {
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

    const getMatchedQty = (variantId) => {
        const match = matchedProductIds.find(v => v.product === variantId);
        return match ? Math.floor(match.qty) : 0;
    };

    if (product.variants.length === 0) {
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
        if (is_active !== true) return { product, variantsData, totalQty };

        const matchedQty = getMatchedQty(product.id);
        let inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
        inventoryLevel = Math.max(inventoryLevel - matchedQty, 0);

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
        for (const variant of product.variants) {
            if (!variant.is_active) continue;

            const variantId = variant.id;
            const matchedQty = getMatchedQty(variantId);
            const variantPrice = variant.price_standard.tax_inclusive;

            const variantDefinitions = variant.variant_definitions;
            let sku = '';
            if (variantDefinitions?.length) {
                sku = variantDefinitions.map(def => def.value).join(' - ');
            }

            const inventoryResponse = await axios.get(
                `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
                {
                    headers: {
                        Authorization: `Bearer ${API_KEY}`,
                        Accept: 'application/json',
                    },
                }
            );

            let inventoryLevel = inventoryResponse.data.data?.[0]?.inventory_level || 0;
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
}

/**
 * Refresh product details from Lightspeed (used by productRefreshController).
 * Uses tax_inclusive ?? tax_exclusive pricing (refresh-specific behavior).
 */
async function fetchProductDetailsForRefresh(id) {
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
        logger.info('[Refresh Product] Hitting Lightspeed API: GET /api/2.0/products/' + id + '/inventory');
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
                sku = variantDefinitions.map(d => d.value).join(' - ');
            }
            logger.info('[Refresh Product] Hitting Lightspeed API: GET /api/2.0/products/' + variantId + '/inventory');
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

    console.log('[Refresh Product] variantsData we are storing:', JSON.stringify(variantsData.map(v => ({ id: v.id, sku: v.sku, price: v.price, qty: v.qty }))));
    return { product, variantsData, totalQty };
}

async function inventoryProductDetailUpdate(type, updateProductId, timeFormatted) {
    const allParkedProductIds = await filterParkProducts();
    const result = getMatchingProductIds(updateProductId, allParkedProductIds);
    let itemId;
    if (result.length > 0) {
        itemId = result[0].product;
    } else {
        itemId = updateProductId;
    }

    const matchedProductIds = [];

    for (const item of allParkedProductIds) {
        const matchedParentProduct = await Product.findOne({
            'variantsData.id': item.product,
        });

        if (matchedParentProduct && matchedParentProduct.product?.id) {
            const matchedVariant = matchedParentProduct.variantsData.find(
                variant => variant.id === item.product
            );

            if (matchedVariant) {
                matchedProductIds.push({
                    product: matchedVariant.id,
                    qty: Math.floor(item.qty),
                });
            }
        }
    }

    const { variantsData, totalQty } = await fetchProductInventoryDetails(itemId, matchedProductIds);
    const status = totalQty !== 0;
    const webhook = type;
    const webhookTime = timeFormatted;
    await Product.updateOne(
        { 'product.id': itemId, status: true },
        { $set: { variantsData, totalQty, status, webhook, webhookTime } }
    );
    console.log(`Inventory Updated (Product Update) Product with ID : ${itemId} : `, type);
    return itemId;
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

/**
 * Refresh a single product by its Lightspeed product ID.
 * Creates a new Product document if it does not exist, otherwise updates.
 * @param {string} productId - The Lightspeed product ID.
 * @returns {Object} { created: boolean, updated: boolean, productId, product }
 */
async function refreshSingleProductById(productId) {
    if (!productId) {
        throw {
            status: 400,
            message: 'Product ID is required.',
        };
    }

    const id = productId;
    console.log('[Refresh Product] Requested productId:', id);

    const existingProductId = await ProductId.findOne({ productId: id });
    if (!existingProductId) {
        await ProductId.create({ productId: id });
        logger.info('[Refresh Product] ProductId was missing in DB — created.');
    } else {
        logger.info('[Refresh Product] ProductId already in ProductId collection.');
    }

    const { product, variantsData, totalQty } = await fetchProductDetailsForRefresh(id);
    fixZeroTaxInclusive(product, variantsData);
    const timeFormatted = await currentTime();
    const type = 'api';
    const productStatus = totalQty > 0;

    const existingEntry = await Product.findOne({ 'product.id': product.id });
    if (existingEntry) {
        logger.info('[Refresh Product] Product already exists in DB (product.id=' + product.id + '). Will update.');
    } else {
        logger.info('[Refresh Product] Product not in DB. Will create new.');
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
        return {
            created: true,
            updated: false,
            productId: product.id,
            product: doc,
        };
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

    return {
        created: false,
        updated: true,
        productId: product.id,
        product: updated,
    };
}

/**
 * Get all products that have webhook === 'product.update'.
 * @returns {{ count: number, webhook: string, products: Array }}
 */
async function getProductsWithWebhookUpdate() {
    const products = await Product.find({ webhook: WEBHOOK_PRODUCT_UPDATE })
        .select(
            '_id product.id product.name totalQty status discount originalPrice discountedPrice isHighest webhook webhookTime'
        )
        .lean();

    return {
        count: products.length,
        webhook: WEBHOOK_PRODUCT_UPDATE,
        products,
    };
}

/**
 * Sync discount fields for all products with webhook === 'product.update'.
 * @returns {Object} Sync result summary.
 */
async function syncWebhookDiscounts() {
    const rows = await Product.find({ webhook: WEBHOOK_PRODUCT_UPDATE })
        .select('product.id')
        .lean();

    const parentIds = [...new Set(rows.map(r => r.product?.id).filter(Boolean))];

    const webhookTime = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Dubai',
        hour12: true,
    });

    for (const pid of parentIds) {
        console.log('product id next updated:', pid);
    }

    const result = await syncDiscountFieldsForParentIds(parentIds, WEBHOOK_AFTER_SYNC, webhookTime);

    return {
        distinctParentIds: parentIds.length,
        syncedParentIds: result.syncedParentIds,
        skippedNotEligible: result.skippedParentIds,
        bulkWriteOperations: result.bulkWriteCount,
    };
}

/**
 * Handle Lightspeed product.update webhook.
 * @param {Object} data - { payload, type }
 * @returns {{ success: boolean }}
 */
async function handleProductUpdate(data) {
    const { payload, type } = data;

    if (!payload) {
        throw { status: 400, message: 'No payload received' };
    }

    let parsedPayload;
    try {
        parsedPayload = JSON.parse(payload);
    } catch (err) {
        throw { status: 400, message: 'Invalid JSON in payload' };
    }

    const productId = parsedPayload?.id;
    const updateProduct = parsedPayload;
    const updateProductId = updateProduct.variant_parent_id
        ? updateProduct.variant_parent_id
        : updateProduct.id;

    if (processedProductIds.has(updateProductId)) {
        logger.info(`Skipping Duplicate Update Product Id : ${updateProductId}`);
        return { success: true, skipped: true };
    }

    processedProductIds.add(updateProductId);
    setTimeout(() => processedProductIds.delete(updateProductId), 5000);

    if (!productId) {
        throw { status: 400, message: 'Missing product ID' };
    }

    const timeFormatted = await currentTime();
    logger.info(`${timeFormatted} ${type} - Received Product Update for ID : ${updateProductId}`);

    const response = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${updateProductId}`,
        {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                Accept: 'application/json',
            },
        }
    );

    const productDetail = response.data.data;
    const onlineStatus = productDetail.ecwid_enabled_webstore;

    const existingProductId = await ProductId.findOne({ productId: updateProductId });
    const webhook = type;
    const webhookTime = timeFormatted;
    if (existingProductId) {
        const { product, variantsData } = await fetchProductDetails(updateProductId, 0);
        fixZeroTaxInclusive(product, variantsData);
        await Product.updateOne(
            { 'product.id': product.id },
            {
                $set: {
                    product,
                    status: onlineStatus === true,
                    webhook,
                    webhookTime,
                },
            }
        );
        console.log(`Product Details Updated Product with ID: ${product.id} : `, type);
    }

    const parentProductId = await inventoryProductDetailUpdate(type, updateProductId, timeFormatted);
    try {
        await applyDiscountFieldsForParentProductId(parentProductId, type, timeFormatted);
    } catch (discountErr) {
        logger.error({ err: discountErr }, 'product.update discount sync failed:');
    }

    return { success: true };
}

/**
 * Handle Lightspeed inventory.update webhook.
 * @param {Object} data - { payload, type }
 * @returns {{ success: boolean }}
 */
async function handleInventoryUpdate(data) {
    const { payload, type } = data;

    if (!payload) {
        throw { status: 400, message: 'No payload received' };
    }

    let parsedPayload;
    try {
        parsedPayload = JSON.parse(payload);
    } catch (err) {
        throw { status: 400, message: 'Invalid JSON in payload' };
    }

    const productId = parsedPayload?.id;
    const updateProduct = parsedPayload?.product;
    const updateProductId = updateProduct.variant_parent_id
        ? updateProduct.variant_parent_id
        : updateProduct.id;

    if (!productId) {
        throw { status: 400, message: 'Missing product ID' };
    }

    const timeFormatted = await currentTime();
    logger.info(`${timeFormatted} ${type} - Received Inventory Update for ID : ${updateProductId}`);

    const allParkedProductIds = await filterParkProducts();
    console.log('All Parked ProductIds : ', allParkedProductIds.length);
    const result = getMatchingProductIds(updateProductId, allParkedProductIds);
    console.log('Matched Product IDs:', result);
    let itemId;
    if (result.length > 0) {
        itemId = result[0].product;
    } else {
        itemId = updateProductId;
    }

    const matchedProductIds = [];

    for (const item of allParkedProductIds) {
        const matchedParentProduct = await Product.findOne({
            'variantsData.id': item.product,
        });

        if (matchedParentProduct && matchedParentProduct.product?.id) {
            const matchedVariant = matchedParentProduct.variantsData.find(
                variant => variant.id === item.product
            );

            if (matchedVariant) {
                matchedProductIds.push({
                    product: matchedVariant.id,
                    qty: Math.floor(item.qty),
                });
            }
        }
    }

    console.log('Matched Parent Product IDs:', matchedProductIds);

    const { variantsData, totalQty } = await fetchProductInventoryDetails(itemId, matchedProductIds);
    const webhook = type;
    const webhookTime = timeFormatted;
    await Product.updateOne(
        { 'product.id': itemId },
        { $set: { variantsData, totalQty, webhook, webhookTime } }
    );
    console.log(`Inventory Updated Product with ID : ${itemId} : `, type);

    try {
        await applyDiscountFieldsForParentProductId(itemId, type, timeFormatted);
    } catch (discountErr) {
        logger.error({ err: discountErr }, 'inventoryUpdate discount sync failed:');
    }

    return { success: true };
}

/**
 * Handle Lightspeed sale webhook (register_sale.update / register_sale.save).
 * @param {Object} data - { payload, type }
 * @returns {{ success: boolean }}
 */
async function handleSaleUpdate(data) {
    const { payload, type } = data;

    if (!payload) {
        throw { status: 400, message: 'No payload received' };
    }

    let parsedPayload;
    try {
        parsedPayload = JSON.parse(payload);
    } catch (err) {
        throw { status: 400, message: 'Invalid JSON in payload' };
    }

    const productId = parsedPayload?.id;
    const updateProductId = parsedPayload.register_sale_products[0].product_id;
    const updateProductQty = parsedPayload.register_sale_products[0].quantity;
    const updateProductStatus = parsedPayload.status;

    if (!productId) {
        throw { status: 400, message: 'Missing product ID' };
    }

    const timeFormatted = await currentTime();
    console.log(
        `${timeFormatted} ${type} - Received Parked Product ID : ${updateProductId} | Quantity : ${updateProductQty} | Status : ${updateProductStatus}`
    );

    const matchedProduct = await Product.findOne({
        'variantsData.id': updateProductId,
    });

    if (matchedProduct) {
        logger.info(`Parent Parked Product Id: ${matchedProduct.product.id}`);
        const itemId = matchedProduct.product.id;
        const existingProductId = await ProductId.findOne({ productId: itemId });
        const productDoc = await Product.findOne({ 'product.id': itemId });
        if (productDoc) {
            const { inventoryLevel } = await fetchProductInventory(
                itemId,
                updateProductId,
                updateProductQty,
                updateProductStatus
            );
            const updatedVariants = productDoc.variantsData.map(variant => {
                if (variant.id === updateProductId) {
                    return { ...variant, qty: inventoryLevel };
                }
                return variant;
            });

            const totalQty = updatedVariants.reduce((sum, v) => sum + (v.qty || 0), 0);
            const webhook = type;
            const webhookTime = timeFormatted;

            await Product.updateOne(
                { 'product.id': itemId },
                {
                    $set: {
                        variantsData: updatedVariants,
                        totalQty,
                        webhook,
                        webhookTime,
                    },
                }
            );

            console.log(`Parked Sale Inventory Updated Product with ID : ${updateProductId} : `, type);

            try {
                await applyDiscountFieldsForParentProductId(itemId, type, timeFormatted);
            } catch (discountErr) {
                logger.error({ err: discountErr }, 'saleUpdate discount sync failed:');
            }
        }
    } else {
        console.log(
            `No Parked Product found for Variant ID : ${updateProductId} | Quantity : ${updateProductQty} | Status : ${updateProductStatus}`
        );
    }

    return { success: true };
}

module.exports = {
    refreshSingleProductById,
    getProductsWithWebhookUpdate,
    syncWebhookDiscounts,
    handleProductUpdate,
    handleInventoryUpdate,
    handleSaleUpdate,
};
