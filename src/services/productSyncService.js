const axios = require('axios');
const { mapLimit } = require('async');
const Product = require('../repositories').products.rawModel();
const ProductId = require('../repositories').productIds.rawModel();
const logger = require("../utilities/logger");
const cache = require('../utilities/cache');
const metrics = require('./metricsService');
const {
    applyDiscountFieldsForParentProductId,
    syncDiscountFieldsForParentIds,
} = require('../helpers/productDiscountSync');

const API_KEY = process.env.API_KEY;
const WEBHOOK_PRODUCT_UPDATE = 'product.update';
const WEBHOOK_AFTER_SYNC = 'updateProductDiscounts';

// Max concurrent Lightspeed inventory calls per product fetch.
// Lightspeed does not publish a hard rate limit; 5 keeps us well clear of
// triggering 429s while still collapsing N sequential calls into ~1 RTT batch.
const INVENTORY_CONCURRENCY = 5;

// Redis-backed dedup lock TTL (seconds).
// Catches true duplicate retries fired in the same burst (Lightspeed occasionally
// fires the same event 2-3× in rapid succession). Kept intentionally short so
// that a genuine second sale/update on the same product a few seconds later is
// still processed. The primary protection against retry storms is the immediate
// 200 ACK in webhookController — Lightspeed won't retry if we respond instantly.
const WEBHOOK_DEDUP_TTL = 3;

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
            product.price_standard.tax_inclusive = String(firstVariantPrice);
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
        logger.warn({ err: error.message }, 'Error fetching park products from Lightspeed');
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
        logger.debug({ productId: id, inventoryLevel, deducted: qty }, 'fetchProductDetails: inventory (no variants)');

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
        const activeVariants = product.variants.filter(v => v.is_active === true);
        logger.debug({ productId: id, totalVariants: product.variants.length, activeVariants: activeVariants.length }, 'fetchProductDetails: fetching variant inventories in parallel');

        await mapLimit(activeVariants, INVENTORY_CONCURRENCY, async (variant) => {
            const variantId = variant.id;
            const variantPrice = variant.price_standard.tax_inclusive;
            const variantDefinitions = variant.variant_definitions;
            const sku = variantDefinitions?.length
                ? variantDefinitions.map(def => def.value).join(' - ')
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
                logger.warn({ productId: id, variantId, err: err.message }, 'fetchProductDetails: inventory fetch failed for variant, skipping');
                return;
            }

            // The specific variant that triggered this update has qty units already
            // reserved/sold — subtract them from the live count so the UI reflects
            // the correct available stock.
            if (variantId === id) {
                inventoryLevel = Math.max(inventoryLevel - qty, 0);
            }

            logger.debug({ productId: id, variantId, inventoryLevel, price: variantPrice }, 'fetchProductDetails: variant inventory');

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

    logger.debug({ productId: id, variantCount: variantsData.length, totalQty }, 'fetchProductDetails: done');
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
    logger.debug({ itemId, parkedMatchCount: matchedProductIds.length }, 'fetchProductInventoryDetails: start');
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
    const parkedQtyMap = new Map(matchedProductIds.map(v => [v.product, Math.floor(v.qty)]));
    const getMatchedQty = (variantId) => parkedQtyMap.get(variantId) ?? 0;

    if (product.variants.length === 0) {
        logger.debug({ itemId }, 'fetchProductInventoryDetails: no variants, fetching single inventory');
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
        logger.debug({ itemId, inventoryLevel, parkedDeduction: matchedQty }, 'fetchProductInventoryDetails: inventory (no variants)');

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
        const activeVariants = product.variants.filter(v => v.is_active);
        logger.debug({ itemId, totalVariants: product.variants.length, activeVariants: activeVariants.length }, 'fetchProductInventoryDetails: fetching variant inventories in parallel');

        await mapLimit(activeVariants, INVENTORY_CONCURRENCY, async (variant) => {
            const variantId = variant.id;
            const matchedQty = getMatchedQty(variantId);
            const variantPrice = variant.price_standard.tax_inclusive;
            const sku = variant.variant_definitions?.length
                ? variant.variant_definitions.map(def => def.value).join(' - ')
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
                logger.warn({ itemId, variantId, err: err.message }, 'fetchProductInventoryDetails: inventory fetch failed for variant, skipping');
                return;
            }

            inventoryLevel = Math.max(inventoryLevel - matchedQty, 0);
            logger.debug({ itemId, variantId, inventoryLevel, parkedDeduction: matchedQty, price: variantPrice }, 'fetchProductInventoryDetails: variant inventory');

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

    logger.debug({ itemId, variantCount: variantsData.length, totalQty }, 'fetchProductInventoryDetails: done');
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
        logger.debug({ taxExclusive: ps.tax_exclusive, taxInclusive: ps.tax_inclusive, storingPrice: price }, '[Refresh Product] price (no variants)');
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
        const activeVariants = product.variants.filter(v => v.is_active === true);
        logger.info({ id, totalVariants: product.variants.length, activeVariants: activeVariants.length }, '[Refresh Product] fetching variant inventories in parallel');

        await mapLimit(activeVariants, INVENTORY_CONCURRENCY, async (variant) => {
            const variantId = variant.id;
            const pv = variant.price_standard || {};
            const variantPrice = pv.tax_inclusive ?? pv.tax_exclusive;
            const sku = variant.variant_definitions?.length
                ? variant.variant_definitions.map(d => d.value).join(' - ')
                : '';

            logger.info({ variantId }, '[Refresh Product] Hitting Lightspeed API: GET /api/2.0/products/:variantId/inventory');
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
                logger.warn({ id, variantId, err: err.message }, '[Refresh Product] inventory fetch failed for variant, skipping');
                return;
            }

            logger.debug({ variantId, taxExclusive: pv.tax_exclusive, taxInclusive: pv.tax_inclusive, storingPrice: variantPrice, inventoryLevel }, '[Refresh Product] price (variant)');

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

    logger.debug({ variantsData: variantsData.map(v => ({ id: v.id, sku: v.sku, price: v.price, qty: v.qty })) }, '[Refresh Product] variantsData to store');
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

    // Batch fetch all parked products in a single query instead of one per item.
    const allParkedVariantIds = allParkedProductIds.map(item => item.product);
    const parkedQtyMap = new Map(allParkedProductIds.map(item => [item.product, item.qty]));
    const batchedParkedProducts = await Product.find({
        'variantsData.id': { $in: allParkedVariantIds },
    }).select('product variantsData').lean();

    const variantToProductMap = new Map();
    for (const prod of batchedParkedProducts) {
        for (const v of (prod.variantsData || [])) {
            variantToProductMap.set(v.id, prod);
        }
    }

    for (const item of allParkedProductIds) {
        const matchedParentProduct = variantToProductMap.get(item.product);

        if (matchedParentProduct && matchedParentProduct.product?.id) {
            const matchedVariant = (matchedParentProduct.variantsData || []).find(
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
    logger.info({ itemId, type }, 'Inventory Updated (Product Update)');
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
    logger.info({ id }, '[Refresh Product] requested');

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
        logger.info({ productId: product.id }, '[Refresh Product] created in MongoDB');
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
    logger.info({ productId: product.id }, '[Refresh Product] updated in MongoDB');
    // Must read from primary — must see the updateOne just issued above.
    const updated = await Product.findOne({ 'product.id': product.id }).read('primary').lean();

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

    logger.info({ parentIds }, 'syncWebhookDiscounts: parent IDs to sync');

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

    // Redis dedup — drop duplicate product.update for the same ID within TTL window.
    // Replaces the old in-memory Set which reset on every container restart.
    const dedupKey = cache.key('webhook', 'product-update', updateProductId);
    const alreadyProcessing = await cache.get(dedupKey);
    if (alreadyProcessing) {
        logger.info({ updateProductId }, 'Skipping duplicate product.update (dedup lock held)');
        metrics.recordDedup('product-update').catch(() => {});
        return { success: true, skipped: true };
    }
    await cache.set(dedupKey, '1', WEBHOOK_DEDUP_TTL);
    metrics.recordWebhook('product-update').catch(() => {});

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
        logger.info({ productId: product.id, type }, 'Product Details Updated');
    }

    const parentProductId = await inventoryProductDetailUpdate(type, updateProductId, timeFormatted);
    try {
        await applyDiscountFieldsForParentProductId(parentProductId, type, timeFormatted);
    } catch (discountErr) {
        logger.error({ err: discountErr }, 'product.update discount sync failed:');
    }

    // Invalidate all catalog caches — product data (price, discount, status) has changed
    await cache.delPattern('catalog:*');
    await cache.del(cache.key('lightspeed', 'categories', 'v1'));
    logger.info({ productId: updateProductId, type }, 'cache invalidated after product.update');

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

    // Redis dedup — drop duplicate inventory.update for the same productId within TTL.
    // Previously had NO dedup at all, causing 233 duplicate calls per product during
    // busy periods when Lightspeed retried slow-responding webhooks.
    const dedupKey = cache.key('webhook', 'inventory-update', updateProductId);
    const alreadyProcessing = await cache.get(dedupKey);
    if (alreadyProcessing) {
        logger.info({ updateProductId }, 'Skipping duplicate inventory.update (dedup lock held)');
        metrics.recordDedup('inventory-update').catch(() => {});
        return { success: true, skipped: true };
    }
    await cache.set(dedupKey, '1', WEBHOOK_DEDUP_TTL);
    metrics.recordWebhook('inventory-update').catch(() => {});

    const timeFormatted = await currentTime();
    logger.info(`${timeFormatted} ${type} - Received Inventory Update for ID : ${updateProductId}`);

    const allParkedProductIds = await filterParkProducts();
    logger.debug({ count: allParkedProductIds.length }, 'All Parked ProductIds');
    const result = getMatchingProductIds(updateProductId, allParkedProductIds);
    logger.debug({ result }, 'Matched Product IDs');
    let itemId;
    if (result.length > 0) {
        itemId = result[0].product;
    } else {
        itemId = updateProductId;
    }

    const matchedProductIds = [];

    // Batch fetch — one query instead of one per parked item.
    const allParkedVariantIds2 = allParkedProductIds.map(item => item.product);
    const batchedParkedProducts2 = await Product.find({
        'variantsData.id': { $in: allParkedVariantIds2 },
    }).select('product variantsData').lean();

    const variantToProductMap2 = new Map();
    for (const prod of batchedParkedProducts2) {
        for (const v of (prod.variantsData || [])) {
            variantToProductMap2.set(v.id, prod);
        }
    }

    for (const item of allParkedProductIds) {
        const matchedParentProduct = variantToProductMap2.get(item.product);

        if (matchedParentProduct && matchedParentProduct.product?.id) {
            const matchedVariant = (matchedParentProduct.variantsData || []).find(
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

    logger.debug({ matchedProductIds }, 'Matched Parent Product IDs');

    const { variantsData, totalQty } = await fetchProductInventoryDetails(itemId, matchedProductIds);
    const webhook = type;
    const webhookTime = timeFormatted;
    await Product.updateOne(
        { 'product.id': itemId },
        { $set: { variantsData, totalQty, webhook, webhookTime } }
    );
    logger.info({ itemId, type }, 'Inventory Updated Product');

    try {
        await applyDiscountFieldsForParentProductId(itemId, type, timeFormatted);
    } catch (discountErr) {
        logger.error({ err: discountErr }, 'inventoryUpdate discount sync failed:');
    }

    // Invalidate catalog caches — inventory/totalQty affects product listings and variants
    await Promise.all([
        cache.delPattern('catalog:*'),
        cache.del(cache.key('lightspeed', 'products-inventory', 'v1')),
    ]);
    logger.info({ productId: itemId, type }, 'cache invalidated after inventory.update');

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

    // Dedup on sale ID + product ID — same sale firing multiple times is safe to drop.
    const dedupKey = cache.key('webhook', 'sale-update', String(productId), String(updateProductId));
    const alreadyProcessing = await cache.get(dedupKey);
    if (alreadyProcessing) {
        logger.info({ productId, updateProductId }, 'Skipping duplicate sale.update (dedup lock held)');
        metrics.recordDedup('sale-update').catch(() => {});
        return { success: true, skipped: true };
    }
    await cache.set(dedupKey, '1', WEBHOOK_DEDUP_TTL);
    metrics.recordWebhook('sale-update').catch(() => {});

    const timeFormatted = await currentTime();
    logger.info({ type, productId: updateProductId, qty: updateProductQty, status: updateProductStatus }, 'Received Parked Product');

    const matchedProduct = await Product.findOne({
        'variantsData.id': updateProductId,
    });

    if (matchedProduct) {
        logger.info(`Parent Parked Product Id: ${matchedProduct.product.id}`);
        const itemId = matchedProduct.product.id;
        const existingProductId = await ProductId.findOne({ productId: itemId });
        // Reuse matchedProduct — it was already fetched above for 'variantsData.id' lookup.
        const productDoc = matchedProduct;
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

            logger.info({ productId: updateProductId, type }, 'Parked Sale Inventory Updated');

            try {
                await applyDiscountFieldsForParentProductId(itemId, type, timeFormatted);
            } catch (discountErr) {
                logger.error({ err: discountErr }, 'saleUpdate discount sync failed:');
            }
        }
    } else {
        logger.info(
            { variantId: updateProductId, qty: updateProductQty, status: updateProductStatus },
            'No parked product found for variant'
        );
    }

    // Invalidate trending/today-deal/favourites — sold quantities have changed
    await Promise.all([
        cache.delPattern('catalog:trending:*'),
        cache.del(cache.key('catalog', 'today-deal', 'v1')),
        cache.del(cache.key('catalog', 'favourites-of-week', 'v1')),
    ]);
    logger.info({ type }, 'cache invalidated after register_sale.update');

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
