const smartCategoriesService = require("../../services/smartCategoriesService");
const Product = require("../../models/Product");
const mongoose = require('mongoose');
const fs = require("fs");
const path = require("path");

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

exports.hotOffers = async (req, res) => {
    try {
        const result = await smartCategoriesService.getHotOffers({ priceField: "tax_exclusive" });
        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.productsByPrice = async (req, res) => {
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
};

exports.getTopRatedProducts = async (req, res) => {
    try {
        const result = await smartCategoriesService.getTopRatedProducts();

        logStatusFalseItems('/api/products/getTopRatedProducts', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.trendingProducts = async (req, res) => {
    try {
        const result = await smartCategoriesService.getTrendingProducts({ timeWindowHours: 100 });

        logStatusFalseItems('/api/products/trendingProducts', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.todayDeal = async (req, res) => {
    try {
        const result = await smartCategoriesService.todayDeal();

        logStatusFalseItems('/api/products/todayDeal', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, "Error in todayDeal:");
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getNewArrivals = async (req, res) => {
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
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getFlashSales = async (req, res) => {
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
};

exports.favouritesOfWeek = async (req, res) => {
    try {
        const result = await smartCategoriesService.favouritesOfWeek();

        logStatusFalseItems('/api/products/favouritesOfWeek', req, res, result);

        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, "Error in favouritesOfWeek:");
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.storeFlashSales = async (req, res) => {
    try {
        const result = await smartCategoriesService.storeFlashSales(req.body);
        res.json(result);
    } catch (err) {
        if (err.responseBody) {
            return res.status(err.status).json(err.responseBody);
        }
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getSuperSaverProducts = async (req, res) => {
    try {
        const result = await smartCategoriesService.getSuperSaverProducts({ minItems: 8 });

        logStatusFalseItems('/api/products/getSuperSaverProducts', req, res, result);

        return res.status(200).json(result);
    } catch (err) {
        logger.error({ err: err }, "Error in getSuperSaverProducts:");
        return res.status(500).json({ status: false, message: "Server error" });
    }
};

exports.getProductByVariant = async (req, res) => {
    try {
        const color = req.query.color;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 54;

        let products = await Product.find({
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
            discountedPrice: { $exists: true, $gt: 0 }
        }).lean();

        let filteredProducts = products.filter(product => {
            if (!product.product?.images || !Array.isArray(product.product.images) || product.product.images.length === 0) {
                return false;
            }
            if (!product.variantsData) return false;
            return product.variantsData.some(variant => getColorFromSku(variant.sku) === color);
        });

        const totalCount = filteredProducts.length;
        const totalPages = Math.ceil(totalCount / limit);
        const paginatedProducts = filteredProducts.slice((page - 1) * limit, page * limit);

        const responseData = {
            success: true,
            products: paginatedProducts,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: totalCount,
                productsPerPage: limit,
                filterColor: color
            }
        };

        logStatusFalseItems('/api/products/getProductByVariant', req, res, responseData);

        res.json(responseData);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

function getColorFromSku(sku) {
    if (sku === "Slightly Used - UAE Specs" || sku === "Slightly Used - Converted to UAE Specs") {
        return "orange";
    } else if (sku === "New - UAE Specs" || sku === "New - Converted to UAE Specs") {
        return "green";
    } else if (sku === "Open Box - UAE Specs" || sku === "Open Box - Converted to UAE Specs") {
        return "yellow";
    } else if (sku === "Used - UAE Specs" || sku === "Used - Converted to UAE Specs") {
        return "red";
    }
    return null;
}
