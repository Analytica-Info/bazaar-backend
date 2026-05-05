const smartCategoriesService = require("../../services/smartCategoriesService");
const Product = require('../../repositories').products.rawModel();
const mongoose = require('mongoose');
const fs = require("fs");
const path = require("path");
const { asyncHandler } = require("../../middleware");
const logger = require("../../utilities/logger");
const logStatusFalseItems = (endpoint, req, res, responseData) => {
    try {
        let products = [];
        if (responseData && typeof responseData === 'object') {
            if (responseData.products) products = responseData.products;
            else if (responseData.filteredProducts) products = responseData.filteredProducts;
            else if (responseData.data && responseData.data.products) products = responseData.data.products;
            else if (responseData.data && Array.isArray(responseData.data)) {
                responseData.data.forEach(item => {
                    if (item.products && Array.isArray(item.products)) {
                        products = products.concat(item.products);
                    }
                });
            }
            else if (responseData.product && responseData.id) {
                products = [responseData];
            }
            else if (Array.isArray(responseData)) products = responseData;
        }

        const falseStatusItems = products.filter(item => item && item.status === false);

        if (falseStatusItems.length > 0) {
            const logFilePath = path.join(__dirname, '../../status_false_log.md');
            const timestamp = new Date().toISOString();

            let logContent = `\n---\n## STATUS FALSE ITEM DETECTED\n\n`;
            logContent += `**Timestamp:** ${timestamp}\n\n`;
            logContent += `**API Endpoint:** ${endpoint}\n\n`;
            logContent += `**Request Data:**\n\`\`\`json\n${JSON.stringify(req.body || req.query || {}, null, 2)}\n\`\`\`\n\n`;
            logContent += `**False Status Items Found:** ${falseStatusItems.length}\n\n`;

            falseStatusItems.forEach((item, index) => {
                logContent += `### Item ${index + 1}:\n`;
                logContent += `- **ID:** ${item._id || item.id || 'N/A'}\n`;
                logContent += `- **Product ID:** ${item.product?.id || 'N/A'}\n`;
                logContent += `- **Name:** ${item.product?.name || 'N/A'}\n`;
                logContent += `- **Status:** ${item.status}\n`;
                logContent += `- **Total Qty:** ${item.totalQty || 'N/A'}\n\n`;
            });

            logContent += `---\n`;

            try {
                if (fs.existsSync(logFilePath)) {
                    fs.appendFileSync(logFilePath, logContent);
                } else {
                    fs.writeFileSync(logFilePath, `# Status False Items Log\n\n${logContent}`);
                }
                logger.info(`ALERT: ${falseStatusItems.length} items with status: false found in ${endpoint}`);
            } catch (fileError) {
                logger.error({ err: fileError }, 'Error writing to status log file:');
            }
        }
    } catch (error) {
        logger.error({ err: error }, 'Error in status logging:');
    }
};

exports.hotOffers = asyncHandler(async (req, res) => {
    try {
        const result = await smartCategoriesService.getHotOffers({ priceField: "tax_exclusive" });
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'smartCategories handler error:');
        res.status(500).json({ message: "Internal Server Error" });
    }
});

exports.productsByPrice = asyncHandler(async (req, res) => {
    const startPrice = parseFloat(req.query.start);
    const endPrice = parseFloat(req.query.end);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 54;

    try {
        const result = await smartCategoriesService.productsByPrice({ startPrice, endPrice, page, limit });

        logStatusFalseItems('/api/products/productsByPrice', req, res, result);

        return res.status(200).json(result);
    } catch (error) {
        if (error.responseBody) {
            return res.status(error.status).json(error.responseBody);
        }
        logger.error({ err: error }, "Error fetching products by price:");
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching products by price"
        });
    }
});

exports.getTopRatedProducts = asyncHandler(async (req, res) => {
    try {
        const result = await smartCategoriesService.getTopRatedProducts();

        logStatusFalseItems('/api/products/getTopRatedProducts', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'smartCategories handler error:');
        res.status(500).json({ message: "Internal Server Error" });
    }
});

exports.trendingProducts = asyncHandler(async (req, res) => {
    try {
        const result = await smartCategoriesService.getTrendingProducts({ timeWindowHours: 100 });

        logStatusFalseItems('/api/products/trendingProducts', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'smartCategories handler error:');
        res.status(500).json({ message: "Internal Server Error" });
    }
});

exports.todayDeal = asyncHandler(async (req, res) => {
    try {
        const result = await smartCategoriesService.todayDeal();

        logStatusFalseItems('/api/products/todayDeal', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, "Error in todayDeal:");
        res.status(500).json({ message: "Internal Server Error" });
    }
});

exports.getNewArrivals = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 54;

    try {
        const result = await smartCategoriesService.getNewArrivals({
            page,
            limit,
            maxItemsFromDb: 200,
            firstPageLimit: null
        });

        logStatusFalseItems('/api/products/getNewArrivals', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'smartCategories handler error:');
        res.status(500).json({ message: "Internal Server Error" });
    }
});

exports.getFlashSales = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    try {
        const result = await smartCategoriesService.getFlashSales({ paginated: true, page, limit });

        logStatusFalseItems('/api/products/getFlashSales', req, res, result);

        return res.status(200).json(result);
    } catch (err) {
        logger.error({ err: err }, "Error in getFlashSales:");
        return res.status(500).json({ status: false, message: "Server error" });
    }
});

exports.favouritesOfWeek = asyncHandler(async (req, res) => {
    try {
        const result = await smartCategoriesService.favouritesOfWeek();

        logStatusFalseItems('/api/products/favouritesOfWeek', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, "Error in favouritesOfWeek:");
        res.status(500).json({ message: "Internal Server Error" });
    }
});

exports.storeFlashSales = asyncHandler(async (req, res) => {
    try {
        const result = await smartCategoriesService.storeFlashSales(req.body);
        res.json(result);
    } catch (err) {
        if (err.responseBody) {
            return res.status(err.status).json(err.responseBody);
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

exports.getSuperSaverProducts = asyncHandler(async (req, res) => {
    try {
        const result = await smartCategoriesService.getSuperSaverProducts({ minItems: 8 });

        logStatusFalseItems('/api/products/getSuperSaverProducts', req, res, result);

        return res.status(200).json(result);
    } catch (err) {
        logger.error({ err: err }, "Error in getSuperSaverProducts:");
        return res.status(500).json({ status: false, message: "Server error" });
    }
});

// SKU values that map to each color badge.
// Inverted mapping of getColorFromSku so we can query Mongo with $in.
const SKUS_BY_COLOR = {
    orange: ["Slightly Used - UAE Specs", "Slightly Used - Converted to UAE Specs"],
    green:  ["New - UAE Specs",           "New - Converted to UAE Specs"],
    yellow: ["Open Box - UAE Specs",      "Open Box - Converted to UAE Specs"],
    red:    ["Used - UAE Specs",          "Used - Converted to UAE Specs"],
};

// LIST_EXCLUDE_PROJECTION mirror — keeps list payloads slim (see productService.js)
const LIST_EXCLUDE_PROJECTION = {
    "product.variants": 0, "product.product_codes": 0, "product.suppliers": 0,
    "product.composite_bom": 0, "product.tag_ids": 0, "product.attributes": 0,
    "product.account_code_sales": 0, "product.account_code_purchase": 0,
    "product.price_outlet": 0, "product.brand_id": 0, "product.deleted_at": 0,
    "product.version": 0, "product.created_at": 0, "product.updated_at": 0,
    webhook: 0, webhookTime: 0, __v: 0, updatedAt: 0, "product.description": 0,
};

const cache = require("../../utilities/cache");
const runtimeConfig = require("../../config/runtime");
const PRODUCTS_BY_VARIANT_TTL = runtimeConfig.cache.productsByVariantTtl;

exports.getProductByVariant = asyncHandler(async (req, res) => {
    try {
        const color = req.query.color;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 54;

        const matchingSkus = SKUS_BY_COLOR[color];
        if (!matchingSkus) {
            return res.json({
                success: true,
                products: [],
                pagination: { currentPage: page, totalPages: 0, totalProducts: 0, productsPerPage: limit, filterColor: color }
            });
        }

        // Redis cache — low-cardinality args (4 colors × page × limit)
        const cacheKey = cache.key("catalog", "by-variant", color, `p${page}`, `l${limit}`, "v1");

        const responseData = await cache.getOrSet(cacheKey, PRODUCTS_BY_VARIANT_TTL, async () => {
            // Push every filter to Mongo; only fetch the page we need.
            const baseQuery = {
                $or: [
                    { status: { $exists: false } },
                    { status: true }
                ],
                discountedPrice: { $exists: true, $gt: 0 },
                "product.images.0": { $exists: true },
                "variantsData.sku": { $in: matchingSkus },
            };

            const [products, totalCount] = await Promise.all([
                Product.find(baseQuery)
                    .select(LIST_EXCLUDE_PROJECTION)
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                Product.countDocuments(baseQuery),
            ]);

            const totalPages = Math.ceil(totalCount / limit);

            return {
                success: true,
                products,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalProducts: totalCount,
                    productsPerPage: limit,
                    filterColor: color,
                }
            };
        });

        logStatusFalseItems('/api/products/getProductByVariant', req, res, responseData);

        res.json(responseData);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Kept for any remaining internal callers — maps SKU string to colour name.
function getColorFromSku(sku) {
    for (const [color, skus] of Object.entries(SKUS_BY_COLOR)) {
        if (skus.includes(sku)) return color;
    }
    return null;
}
