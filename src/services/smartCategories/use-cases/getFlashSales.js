'use strict';

const Product = require('../../../repositories').products.rawModel();
const FlashSale = require('../../../repositories').flashSales.rawModel();
const cache = require('../../../utilities/cache');
const clock = require('../../../utilities/clock');
const { LIST_EXCLUDE_SELECT } = require('../domain/projections');

const runtimeConfig = require('../../../config/runtime');
const SMART_CAT_TTL = runtimeConfig.cache.smartCategoryTtl;

/**
 * Get flash sale products.
 * @param {Object} config
 * @param {boolean} config.paginated - if true, paginates "all" bucket (mobile); if false, flat (ecommerce)
 * @param {number} [config.page]
 * @param {number} [config.limit]
 */
async function getFlashSales({ paginated, page, limit }) {
    const cacheKey = cache.key('catalog', 'flash-sale', paginated ? `mobile:${page}:${limit}` : 'ecom');
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const flashSale = await FlashSale.findOne().sort({ createdAt: -1 }).lean();
    if (!flashSale) {
        return { status: false, message: "No flash sale configured" };
    }

    if (!flashSale.isEnabled) {
        return { status: false, flashSale, message: "Flash sale is currently disabled" };
    }

    const now = clock.now();
    const startDateTime = new Date(`${flashSale.startDay}T${flashSale.startTime}:00+04:00`);
    const endDateTime = new Date(`${flashSale.endDay}T${flashSale.endTime}:00+04:00`);

    if (now < startDateTime || now > endDateTime) {
        return { status: false, flashSale, message: "Flash sale not active currently" };
    }

    const productQuery = paginated
        ? {
            $or: [{ status: { $exists: false } }, { status: true }],
            sold: { $exists: true, $gt: 0 },
            discountedPrice: { $exists: true, $gt: 0 }
        }
        : {
            status: true,
            totalQty: { $gt: 0 },
            sold: { $exists: true, $gt: 0 }
        };

    const FLASH_SALE_MAX_DOCS = paginated ? 2000 : 200;
    const [allProductsFromDB, flashSaleTotalCount] = await Promise.all([
        Product.find(productQuery)
            .select(LIST_EXCLUDE_SELECT)
            .limit(FLASH_SALE_MAX_DOCS)
            .lean(),
        paginated ? Product.countDocuments({ ...productQuery, "product.images.0": { $exists: true } }) : Promise.resolve(0),
    ]);

    const ranges = [
        { label: "0 - 10%", min: 1, max: 10, name: "10%" },
        { label: "10 - 20%", min: 11, max: 20, name: "20%" },
        { label: "20 - 30%", min: 21, max: 30, name: "30%" },
        { label: "30 - 40%", min: 31, max: 40, name: "40%" },
        { label: "40 - 50%", min: 41, max: 50, name: "50%" },
        { label: "50 - 60%", min: 51, max: 60, name: "60%" },
        { label: "60 - 70%", min: 61, max: 70, name: "70%" },
        { label: "70 - 80%", min: 71, max: 80, name: "80%" },
        { label: "80 - 90%", min: 81, max: 90, name: "90%" },
        { label: "90 - 99%", min: 91, max: 99, name: "99%" },
    ];

    const discountBuckets = {};
    ranges.forEach(r => (discountBuckets[r.label] = []));
    discountBuckets["all"] = [];

    for (let product of allProductsFromDB) {
        if (!product.product?.images || !Array.isArray(product.product.images) || product.product.images.length === 0) {
            continue;
        }

        const d = product.discount;
        const range = ranges.find(r => d >= r.min && d < r.max);
        if (range && discountBuckets[range.label].length < 10) {
            discountBuckets[range.label].push(product);
        }

        discountBuckets["all"].push(product);

        if (ranges.every(r => discountBuckets[r.label].length >= 10)) break;
    }

    if (paginated) {
        const allProducts = discountBuckets["all"];
        const totalCount = flashSaleTotalCount || allProducts.length;
        const totalPages = Math.ceil(totalCount / limit);
        const paginatedAllProducts = allProducts.slice((page - 1) * limit, page * limit);

        const formatted = [
            { label: "all", name: "all", products: paginatedAllProducts },
            ...ranges.map(r => ({ label: r.label, name: r.name, products: discountBuckets[r.label] }))
        ];

        const result = {
            status: true,
            flashSale,
            pagination: { currentPage: page, totalPages, totalProducts: totalCount, productsPerPage: limit },
            data: formatted
        };
        await cache.set(cacheKey, result, SMART_CAT_TTL);
        return result;
    } else {
        const formatted = [
            { label: "all", name: "all", products: discountBuckets["all"].slice(0, 100) },
            ...ranges.map(r => ({ label: r.label, name: r.name, products: discountBuckets[r.label] }))
        ];

        const result = { status: true, flashSale, data: formatted };
        await cache.set(cacheKey, result, SMART_CAT_TTL);
        return result;
    }
}

module.exports = { getFlashSales };
