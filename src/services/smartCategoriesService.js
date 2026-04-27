const Product = require("../models/Product");
const Review = require("../models/Review");
const OrderDetail = require("../models/OrderDetail");
const FlashSale = require("../models/FlashSale");
const mongoose = require('mongoose');
const cache = require('../utilities/cache');

// Shared TTL for smart-category reads — 5 minutes.
// Short enough to feel fresh, long enough to absorb the per-minute request
// volume (2,400+/day on /api/products/products alone).
const SMART_CAT_TTL = 300;

// Mirror of productService.js LIST_EXCLUDE_* — keep in sync when adding fields.
// See productService.js for rationale and audit date.
const LIST_EXCLUDE_PROJECTION = {
    // Phase 1a
    "product.variants": 0,
    "product.product_codes": 0,
    "product.suppliers": 0,
    "product.composite_bom": 0,
    "product.tag_ids": 0,
    "product.attributes": 0,
    "product.account_code_sales": 0,
    "product.account_code_purchase": 0,
    "product.price_outlet": 0,
    "product.brand_id": 0,
    "product.deleted_at": 0,
    "product.version": 0,
    "product.created_at": 0,
    "product.updated_at": 0,
    // Phase 2
    webhook: 0,
    webhookTime: 0,
    __v: 0,
    updatedAt: 0,
    // Phase 3
    "product.description": 0,
};

const LIST_EXCLUDE_SELECT = [
    // Phase 1a
    "product.variants",
    "product.product_codes",
    "product.suppliers",
    "product.composite_bom",
    "product.tag_ids",
    "product.attributes",
    "product.account_code_sales",
    "product.account_code_purchase",
    "product.price_outlet",
    "product.brand_id",
    "product.deleted_at",
    "product.version",
    "product.created_at",
    "product.updated_at",
    // Phase 2
    "webhook",
    "webhookTime",
    "__v",
    "updatedAt",
    // Phase 3
    "product.description",
]
    .map((f) => `-${f}`)
    .join(" ");

const getDubaiDateUTC = () => {
    return new Date();
};

/**
 * Get hot offers grouped by price ranges.
 * @param {Object} config
 * @param {string} config.priceField - "tax_inclusive" or "tax_exclusive"
 */
exports.getHotOffers = async ({ priceField }) => {
  return cache.getOrSet(
    cache.key('catalog', 'hot-offers', priceField, 'v1'),
    SMART_CAT_TTL,
    async () => {
    const ranges = [
        { min: 1, max: 49, priceRange: "AED 1 - 49", label: "Budget Finds" },
        { min: 50, max: 99, priceRange: "AED 50 - 99", label: "Hot Mid-Range Deals" },
        { min: 100, max: 199, priceRange: "AED 100 - 199", label: "Smart Value Picks" },
        { min: 200, max: 299, priceRange: "AED 200 - 299", label: "Premium at a Price" },
        { min: 300, max: 399, priceRange: "AED 300 - 399", label: "Crowd Favorites" },
        { min: 400, max: 499, priceRange: "AED 400 - 499", label: "Quality Meets Value" },
    ];

    const result = await Promise.all(
        ranges.map(async (range) => {
            // Pre-fix: used $addFields { $toDouble($trim($product.price_standard.<field>)) }
            // + $match on the computed field, which forced a full collection scan every call
            // (4,883 docs / 126ms each per range × 6 ranges per request).
            //
            // Fixed: filter on the indexed numeric `discountedPrice` field. Covered by the
            // compound {status, totalQty, discountedPrice} index after Product.status migration.
            //
            // Semantic: discountedPrice is the lowest variant's final price (post-discount),
            // which is what the customer actually pays — the right basis for a hot-offers grid.
            const pipeline = [
                {
                    $match: {
                        status: true,
                        totalQty: { $gt: 0 },
                        discountedPrice: { $gte: range.min, $lte: range.max },
                        "product.images.0": { $exists: true },
                    },
                },
                { $sample: { size: 20 } },
                {
                    $project: {
                        images: "$product.images.sizes.original",
                    },
                },
            ];

            const products = await Product.aggregate(pipeline);

            let photos;
            if (priceField === "tax_exclusive") {
                // Mobile filter: exclude .webp
                photos = products
                    .flatMap((p) => p.images || [])
                    .filter(
                        (img) =>
                            typeof img === "string" &&
                            !img.toLowerCase().endsWith(".webp")
                    );
            } else {
                // Ecommerce filter: must have valid image extension
                photos = products
                    .flatMap((p) => p.images || [])
                    .filter((img) => {
                        if (typeof img !== "string" || !img.trim()) return false;
                        const lower = img.toLowerCase();
                        const hasExtension = /\.(jpg|jpeg|png|gif|webp|svg|bmp|jfif|tiff)(\?.*)?$/.test(lower);
                        return hasExtension;
                    });
            }

            if (photos.length > 4) {
                photos = photos.sort(() => 0.5 - Math.random()).slice(0, 4);
            }

            return {
                priceRange: range.priceRange,
                label: range.label,
                images: photos,
            };
        })
    );

    return result;
    }
  );
};

/**
 * Get products filtered by price range with pagination.
 * @param {Object} config
 * @param {number} config.startPrice
 * @param {number} config.endPrice
 * @param {number} config.page
 * @param {number} config.limit
 */
exports.productsByPrice = async ({ startPrice, endPrice, page, limit }) => {
    if (isNaN(startPrice) || isNaN(endPrice)) {
        const err = new Error("Invalid price range parameters");
        err.status = 400;
        err.responseBody = { success: false, message: "Invalid price range parameters" };
        throw err;
    }

    // Push image-existence check to the query so:
    //  (1) we don't over-fetch docs without images and slice in JS
    //  (2) countDocuments gives us the real count directly
    const query = {
        totalQty: { $gt: 0 },
        $or: [
            { status: { $exists: false } },
            { status: true }
        ],
        discountedPrice: { $gte: startPrice, $lte: endPrice },
        "product.images.0": { $exists: true },
    };

    const products = await Product.find(query)
        .select(LIST_EXCLUDE_SELECT)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

    const totalCount = await Product.countDocuments(query);

    const totalPages = Math.ceil(totalCount / limit);

    return {
        success: true,
        products,
        pagination: {
            currentPage: page,
            totalPages,
            totalProducts: totalCount,
            productsPerPage: limit,
            priceRange: `${startPrice} - ${endPrice}`
        }
    };
};

/**
 * Get top rated products based on reviews.
 */
exports.getTopRatedProducts = async () => {
  return cache.getOrSet(cache.key('catalog', 'top-rated', 'v1'), SMART_CAT_TTL, async () => {
    const topProducts = await Review.aggregate([
        {
            $addFields: {
                avgRating: {
                    $avg: ["$quality_rating", "$value_rating", "$price_rating"]
                }
            }
        },
        {
            $group: {
                _id: "$product_id",
                avgRating: { $avg: "$avgRating" },
                totalReviews: { $sum: 1 }
            }
        },
        {
            $sort: { avgRating: -1 }
        },
        {
            $limit: 10
        },
        {
            $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "product.id",
                as: "product"
            }
        },
        { $unwind: "$product" },
        {
            $addFields: {
                "product.avgRating": "$avgRating",
                "product.totalReviews": "$totalReviews"
            }
        },
        {
            $replaceRoot: { newRoot: "$product" }
        },
        {
            $project: LIST_EXCLUDE_PROJECTION
        }
    ]);

    const products = await Product.aggregate([
        {
            $match: {
                status: true,
                totalQty: { $gt: 0 }
            }
        },
        {
            $match: {
                $expr: {
                    $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                }
            }
        },
        {
            $sample: { size: 10 }
        },
        {
            $project: LIST_EXCLUDE_PROJECTION
        }
    ]);

    const filteredTopProducts = topProducts.filter(product =>
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
    );

    const finalData = [...new Map([...filteredTopProducts, ...products].map(item => [item._id.toString(), item])).values()]
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);

    return {
        status: finalData.length > 0,
        count: finalData.length,
        products: finalData
    };
  });
};

/**
 * Get trending products based on recent sales.
 * @param {Object} config
 * @param {number} config.timeWindowHours - 72 for ecommerce, 100 for mobile
 */
exports.getTrendingProducts = async ({ timeWindowHours }) => {
  return cache.getOrSet(
    cache.key('catalog', 'trending', `w${timeWindowHours}`, 'v1'),
    SMART_CAT_TTL,
    async () => {
    const nowDubaiUTC = getDubaiDateUTC();
    const cutoff = new Date(nowDubaiUTC.getTime() - timeWindowHours * 60 * 60 * 1000);

    const soldProducts = await OrderDetail.aggregate([
        { $match: { createdAt: { $gte: cutoff } } },
        {
            $group: {
                _id: "$product_id",
                totalSold: { $sum: "$quantity" },
            },
        },
        { $match: { totalSold: { $gte: 1 } } },
    ]);

    const soldProductIds = soldProducts.map(p => p._id);
    if (!soldProductIds.length) {
        return {
            status: false,
            count: 0,
            products: []
        };
    }

    const trendingProducts = await Product.find(
        { 'product.id': { $in: soldProductIds } }
    )
        .select(LIST_EXCLUDE_SELECT)
        .lean();

    const filteredTrendingProducts = trendingProducts.filter(product =>
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
    );

    const products = await Product.aggregate([
        {
            $match: {
                status: true,
                totalQty: { $gt: 0 }
            }
        },
        {
            $match: {
                $expr: {
                    $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                }
            }
        },
        {
            $sample: { size: 10 }
        },
        {
            $project: LIST_EXCLUDE_PROJECTION
        }
    ]);

    const finalData = [...new Map([...filteredTrendingProducts, ...products].map(item => [item._id.toString(), item])).values()]
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);

    return {
        status: finalData.length > 0,
        count: finalData.length,
        products: finalData
    };
    }
  );
};

/**
 * Get today's deal products.
 */
exports.todayDeal = async () => {
  return cache.getOrSet(cache.key('catalog', 'today-deal', 'v1'), SMART_CAT_TTL, async () => {
    const nowDubaiUTC = getDubaiDateUTC();
    const seventyTwoHoursAgoUTC = new Date(nowDubaiUTC.getTime() - 72 * 60 * 60 * 1000);

    const soldProducts = await OrderDetail.aggregate([
        { $match: { createdAt: { $gte: seventyTwoHoursAgoUTC } } },
        {
            $group: {
                _id: "$product_id",
                totalSold: { $sum: "$quantity" },
            },
        },
        { $match: { totalSold: { $gte: 1 } } },
    ]);

    const soldProductIds = soldProducts.map(p => p._id);
    let trendingProducts = [];
    if (soldProductIds.length) {
        trendingProducts = await Product.find({
            'product.id': { $in: soldProductIds },
            totalQty: { $gt: 0 }
        })
            .select(LIST_EXCLUDE_SELECT)
            .lean();

        trendingProducts = trendingProducts.filter(product =>
            product.product?.images &&
            Array.isArray(product.product.images) &&
            product.product.images.length > 0
        );

        const soldMap = Object.fromEntries(soldProducts.map(s => [s._id.toString(), s.totalSold]));
        trendingProducts.sort((a, b) => {
            const soldA = soldMap[a._id.toString()] || 0;
            const soldB = soldMap[b._id.toString()] || 0;

            if (b.discount !== a.discount) return b.discount - a.discount;
            return soldB - soldA;
        });
    }

    const products = await Product.aggregate([
        {
            $match: {
                status: true,
                totalQty: { $gt: 0 }
            }
        },
        {
            $match: {
                $expr: {
                    $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                }
            }
        },
        { $sample: { size: 10 } },
        { $project: LIST_EXCLUDE_PROJECTION }
    ]);

    const finalData = [...new Map([...trendingProducts, ...products].map(item => [item._id.toString(), item])).values()]
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);

    return {
        status: finalData.length > 0,
        count: finalData.length,
        products: finalData
    };
  });
};

/**
 * Get new arrival products with pagination.
 * @param {Object} config
 * @param {number} config.page
 * @param {number} config.limit
 * @param {number} config.maxItemsFromDb
 * @param {number|null} config.firstPageLimit - if set, first page uses different limit (ecommerce mode)
 */
exports.getNewArrivals = async ({ page, limit, maxItemsFromDb, firstPageLimit }) => {
  return cache.getOrSet(
    cache.key('catalog', 'new-arrivals', `p${page}`, `l${limit}`, `fpl${firstPageLimit || 0}`, 'v1'),
    SMART_CAT_TTL,
    async () => {
    let skip, effectiveLimit;

    if (firstPageLimit) {
        // Ecommerce mode: first page has different limit
        const NEXT_PAGES_LIMIT = firstPageLimit; // reuse same value for subsequent pages
        skip = page === 1 ? 0 : firstPageLimit + (page - 2) * NEXT_PAGES_LIMIT;
        effectiveLimit = page === 1 ? firstPageLimit : NEXT_PAGES_LIMIT;
    } else {
        // Mobile/standard mode: uniform pagination
        skip = (page - 1) * limit;
        effectiveLimit = limit;
    }

    const result = await Product.aggregate([
        {
            $match: {
                status: true,
                totalQty: { $gt: 0 },
                createdAt: { $exists: true }
            }
        },
        {
            $match: {
                $expr: {
                    $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                }
            }
        },
        { $sort: { createdAt: -1 } },
        { $limit: maxItemsFromDb },
        {
            $facet: {
                totalCount: [{ $count: "count" }],
                products: [
                    { $skip: skip },
                    { $limit: effectiveLimit },
                    { $project: LIST_EXCLUDE_PROJECTION }
                ]
            }
        }
    ]);

    const totalCount = result[0].totalCount[0]?.count ?? 0;
    const products = result[0].products ?? [];

    let totalPages;
    if (firstPageLimit) {
        totalPages = totalCount <= firstPageLimit
            ? 1
            : 1 + Math.ceil((totalCount - firstPageLimit) / firstPageLimit);
    } else {
        totalPages = Math.ceil(totalCount / limit);
    }

    const response = {
        status: products.length > 0,
        count: products.length,
        products,
        pagination: {
            currentPage: page,
            totalPages,
            totalProducts: totalCount,
            productsPerPage: effectiveLimit,
        }
    };

    // Ecommerce adds success field
    if (firstPageLimit) {
        response.success = true;
    }

    return response;
    }
  );
};

/**
 * Get flash sale products.
 * @param {Object} config
 * @param {boolean} config.paginated - if true, paginates the "all" bucket (mobile); if false, returns flat (ecommerce)
 * @param {number} [config.page] - page number (only used when paginated)
 * @param {number} [config.limit] - items per page (only used when paginated)
 */
exports.getFlashSales = async ({ paginated, page, limit }) => {
    const cacheKey = cache.key('catalog', 'flash-sale', paginated ? `mobile:${page}:${limit}` : 'ecom');
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const flashSale = await FlashSale.findOne().sort({ createdAt: -1 }).lean();
    if (!flashSale) {
        return { status: false, message: "No flash sale configured" };
    }

    if (!flashSale.isEnabled) {
        return {
            status: false,
            flashSale,
            message: "Flash sale is currently disabled",
        };
    }

    const now = new Date();
    const startDateTime = new Date(`${flashSale.startDay}T${flashSale.startTime}:00+04:00`);
    const endDateTime = new Date(`${flashSale.endDay}T${flashSale.endTime}:00+04:00`);

    if (now < startDateTime || now > endDateTime) {
        return {
            status: false,
            flashSale,
            message: "Flash sale not active currently",
        };
    }

    const productQuery = paginated
        ? {
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
            sold: { $exists: true, $gt: 0 },
            discountedPrice: { $exists: true, $gt: 0 }
        }
        : {
            status: true,
            totalQty: { $gt: 0 },
            sold: { $exists: true, $gt: 0 }
        };

    // For ecommerce: we return at most 100 for "all" + 10 per range (10 ranges) = 200 max.
    // For mobile (paginated): we need totalCount for pagination metadata, then fetch a page.
    // Use countDocuments in parallel with the product fetch to avoid loading all docs.
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

        const productWithDiscount = product;
        const d = productWithDiscount.discount;

        const range = ranges.find(r => d >= r.min && d < r.max);
        if (range && discountBuckets[range.label].length < 10) {
            discountBuckets[range.label].push(productWithDiscount);
        }

        discountBuckets["all"].push(productWithDiscount);

        if (ranges.every(r => discountBuckets[r.label].length >= 10)) break;
    }

    if (paginated) {
        const allProducts = discountBuckets["all"];
        // Use the parallel countDocuments result for true total (not limited by FLASH_SALE_MAX_DOCS)
        const totalCount = flashSaleTotalCount || allProducts.length;
        const totalPages = Math.ceil(totalCount / limit);
        const paginatedAllProducts = allProducts.slice((page - 1) * limit, page * limit);

        const formatted = [
            {
                label: "all",
                name: "all",
                products: paginatedAllProducts
            },
            ...ranges.map(r => ({
                label: r.label,
                name: r.name,
                products: discountBuckets[r.label]
            }))
        ];

        const result = {
            status: true,
            flashSale: flashSale,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: totalCount,
                productsPerPage: limit,
            },
            data: formatted
        };
        await cache.set(cacheKey, result, SMART_CAT_TTL);
        return result;
    } else {
        // Ecommerce: flat (no pagination on "all")
        const formatted = [
            {
                label: "all",
                name: "all",
                products: discountBuckets["all"].slice(0, 100)
            },
            ...ranges.map(r => ({
                label: r.label,
                name: r.name,
                products: discountBuckets[r.label]
            }))
        ];

        const result = {
            status: true,
            flashSale: flashSale,
            data: formatted
        };
        await cache.set(cacheKey, result, SMART_CAT_TTL);
        return result;
    }
};

/**
 * Get super saver products with high discounts.
 * @param {Object} config
 * @param {number} config.minItems - 20 for ecommerce, 8 for mobile
 */
exports.getSuperSaverProducts = async ({ minItems }) => {
  return cache.getOrSet(
    cache.key('catalog', 'super-saver', `n${minItems}`, 'v1'),
    SMART_CAT_TTL,
    async () => {
    const ranges = { min: 1, max: 99 };
    const requiredCount = minItems;

    // Only need .discount for the return value — strip everything else
    const highestDiscountProduct = await Product.findOne({ isHighest: true })
        .select("discount")
        .lean();

    // Single bounded aggregation replaces the while loop that could spin indefinitely.
    // $match on discount range first, then $sample from that filtered set.
    const superSaverProducts = await Product.aggregate([
        {
            $match: {
                discount: { $gte: ranges.min, $lte: ranges.max },
                $expr: { $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0] }
            }
        },
        { $sample: { size: requiredCount } },
        { $project: LIST_EXCLUDE_PROJECTION }
    ]);

    return {
        status: superSaverProducts.length > 0,
        count: superSaverProducts.length,
        highestDiscount: highestDiscountProduct.discount,
        products: superSaverProducts
    };
    }
  );
};

/**
 * Get favourites of the week based on sales in last 7 days.
 */
exports.favouritesOfWeek = async () => {
  return cache.getOrSet(cache.key('catalog', 'favourites-of-week', 'v1'), SMART_CAT_TTL, async () => {
    const nowDubaiUTC = getDubaiDateUTC();
    const sevenDaysAgoUTC = new Date(nowDubaiUTC.getTime() - 7 * 24 * 60 * 60 * 1000);

    const soldProducts = await OrderDetail.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgoUTC } } },
        {
            $group: {
                _id: "$product_id",
                totalSold: { $sum: "$quantity" },
            },
        },
        { $match: { totalSold: { $gte: 1 } } },
    ]);

    const soldProductIds = soldProducts.map(p => p._id);
    if (!soldProductIds.length) {
        return {
            status: false,
            count: 0,
            products: []
        };
    }

    let products = await Product.find({
        'product.id': { $in: soldProductIds },
        totalQty: { $gt: 0 }
    })
        .select(LIST_EXCLUDE_SELECT)
        .lean();

    products = products.filter(product =>
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
    );

    const soldMap = Object.fromEntries(soldProducts.map(s => [s._id.toString(), s.totalSold]));
    products.sort((a, b) => {
        const soldA = soldMap[a._id.toString()] || 0;
        const soldB = soldMap[b._id.toString()] || 0;

        if (soldB !== soldA) return soldB - soldA;
        return b.discount - a.discount;
    });

    const favourites = products.slice(0, 20);

    const randomProducts = await Product.aggregate([
        {
            $match: {
                status: true,
                totalQty: { $gt: 0 }
            }
        },
        {
            $match: {
                $expr: {
                    $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                }
            }
        },
        {
            $sample: { size: 10 }
        },
        {
            $project: LIST_EXCLUDE_PROJECTION
        }
    ]);

    const finalData = [...new Map([...randomProducts, ...favourites].map(item => [item._id.toString(), item])).values()]
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);

    return {
        status: finalData.length > 0,
        count: finalData.length,
        products: finalData
    };
  });
};

/**
 * Store or update flash sale configuration.
 * @param {Object} config
 * @param {string} config.startDay
 * @param {string} config.startTime
 * @param {string} config.endDay
 * @param {string} config.endTime
 * @param {boolean} [config.isEnabled]
 */
exports.storeFlashSales = async ({ startDay, startTime, endDay, endTime, isEnabled }) => {
    if (!startDay || !startTime || !endDay || !endTime) {
        const err = new Error("All fields required");
        err.status = 400;
        err.responseBody = { success: false, message: "All fields required" };
        throw err;
    }

    let flashSale = await FlashSale.findOne();
    if (flashSale) {
        flashSale.startDay = startDay;
        flashSale.startTime = startTime;
        flashSale.endDay = endDay;
        flashSale.endTime = endTime;
        if (isEnabled !== undefined) {
            flashSale.isEnabled = isEnabled;
        }
        await flashSale.save();
    } else {
        flashSale = await FlashSale.create({
            startDay,
            startTime,
            endDay,
            endTime,
            isEnabled: isEnabled !== undefined ? isEnabled : true
        });
    }

    await cache.delPattern('catalog:flash-sale:*');

    return { success: true, flashSale };
};
