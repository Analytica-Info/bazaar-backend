const smartCategoriesService = require("../../services/smartCategoriesService");
const FlashSale = require('../../repositories').flashSales.rawModel();
const Product = require('../../repositories').products.rawModel();

const logger = require("../../utilities/logger");
exports.hotOffers = async (req, res) => {
    try {
        const result = await smartCategoriesService.getHotOffers({ priceField: "tax_inclusive" });
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'smartCategories handler error:');
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
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'smartCategories handler error:');
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.trendingProducts = async (req, res) => {
    try {
        const result = await smartCategoriesService.getTrendingProducts({ timeWindowHours: 72 });
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'smartCategories handler error:');
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.todayDeal = async (req, res) => {
    try {
        const result = await smartCategoriesService.todayDeal();
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, "Error in todayDeal:");
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getNewArrivals = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const FIRST_PAGE_LIMIT = 55;

    try {
        const result = await smartCategoriesService.getNewArrivals({
            page,
            limit: FIRST_PAGE_LIMIT,
            maxItemsFromDb: 200,
            firstPageLimit: FIRST_PAGE_LIMIT
        });
        res.status(200).json(result);
    } catch (error) {
        logger.error({ err: error }, 'smartCategories handler error:');
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getFlashSales = async (req, res) => {
    try {
        const result = await smartCategoriesService.getFlashSales({ paginated: false });
        return res.status(200).json(result);
    } catch (err) {
        logger.error({ err: err }, "Error in getFlashSales:");
        return res.status(500).json({ status: false, message: "Server error" });
    }
};

exports.getSuperSaverProducts = async (req, res) => {
    try {
        const result = await smartCategoriesService.getSuperSaverProducts({ minItems: 20 });
        return res.status(200).json(result);
    } catch (err) {
        logger.error({ err: err }, "Error in getSuperSaverProducts:");
        return res.status(500).json({ status: false, message: "Server error" });
    }
};

exports.favouritesOfWeek = async (req, res) => {
    try {
        const result = await smartCategoriesService.favouritesOfWeek();
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

// Admin-only functions - kept as direct implementations (single consumer)

exports.toggleFlashSaleStatus = async (req, res) => {
    try {
        const { isEnabled } = req.body;

        if (typeof isEnabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: "isEnabled field is required and must be a boolean"
            });
        }

        let flashSale = await FlashSale.findOne();
        if (!flashSale) {
            return res.status(404).json({
                success: false,
                message: "No flash sale configuration found. Please create one first."
            });
        }

        flashSale.isEnabled = isEnabled;
        await flashSale.save();

        res.json({
            success: true,
            message: `Flash sale ${isEnabled ? 'enabled' : 'disabled'} successfully`,
            flashSale
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getFlashSaleData = async (req, res) => {
    try {
        const flashSale = await FlashSale.findOne();

        if (!flashSale) {
            return res.status(404).json({
                success: false,
                message: "No flash sale configuration found"
            });
        }

        res.json({
            success: true,
            flashSale
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

exports.exportProductsAvailability = async (req, res) => {
    try {
        const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;

        const products = await Product.find({ status: true }, { product: 1, status: 1 }).lean();

        const csvStringifier = createCsvStringifier({
            header: [
                { id: 'name', title: 'Name' },
                { id: 'description', title: 'Description' },
                { id: 'available', title: 'Available' },
            ]
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="products_availability.csv"');

        res.write(csvStringifier.getHeaderString());

        const stripHtml = (html) => {
            if (!html || typeof html !== 'string') return '';
            const withoutTags = html.replace(/<[^>]*>/g, ' ');
            return withoutTags.replace(/\s+/g, ' ').trim();
        };

        const records = products
            .filter(p => p.status === true)
            .map(p => ({
                name: p?.product?.name || '',
                description: stripHtml(p?.product?.description || ''),
                available: 'Yes',
            }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        res.write(csvStringifier.stringifyRecords(records));
        res.end();
    } catch (err) {
        logger.error({ err: err }, 'Error exporting products availability:');
        res.status(500).json({ success: false, message: 'Failed to export products availability' });
    }
};
