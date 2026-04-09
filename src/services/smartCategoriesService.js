const Product = require("../models/Product");
const Review = require("../models/Review");
const OrderDetail = require("../models/OrderDetail");
const FlashSale = require("../models/FlashSale");
const mongoose = require('mongoose');

const getDubaiDateUTC = () => {
    return new Date();
};

/**
 * Get hot offers grouped by price ranges.
 * @param {Object} config
 * @param {string} config.priceField - "tax_inclusive" or "tax_exclusive"
 */
exports.getHotOffers = async ({ priceField }) => {
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
            const matchStage = priceField === "tax_exclusive"
                ? {
                    priceNum: { $gte: range.min, $lte: range.max },
                    "product.images": { $exists: true, $type: "array", $ne: [] },
                    $or: [
                        { status: { $exists: false } },
                        { status: true }
                    ],
                    discountedPrice: { $exists: true, $gt: 0 }
                }
                : {
                    priceNum: { $gte: range.min, $lte: range.max },
                };

            const pipeline = [
                {
                    $addFields: {
                        priceNum: {
                            $toDouble: {
                                $trim: { input: `$product.price_standard.${priceField}` },
                            },
                        },
                    },
                },
                {
                    $match: matchStage,
                },
            ];

            // Ecommerce (tax_inclusive) has separate image-check stage
            if (priceField === "tax_inclusive") {
                pipeline.push({
                    $match: {
                        $expr: {
                            $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                        }
                    },
                });
            }

            pipeline.push(
                {
                    $project: {
                        images: "$product.images.sizes.original",
                    },
                },
                { $sample: { size: 20 } }
            );

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

    let query = {
        totalQty: { $gt: 0 },
        $or: [
            { status: { $exists: false } },
            { status: true }
        ],
        discountedPrice: { $gte: startPrice, $lte: endPrice }
    };

    const allProducts = await Product.find(query).skip((page - 1) * limit).limit(limit * 2);
    const products = allProducts.filter(product =>
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
    ).slice(0, limit);

    const allProductsForCount = await Product.find(query);
    const totalCount = allProductsForCount.filter(product =>
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
    ).length;

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
};

/**
 * Get trending products based on recent sales.
 * @param {Object} config
 * @param {number} config.timeWindowHours - 72 for ecommerce, 100 for mobile
 */
exports.getTrendingProducts = async ({ timeWindowHours }) => {
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
    );

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
};

/**
 * Get today's deal products.
 */
exports.todayDeal = async () => {
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
        }).lean();

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
        { $sample: { size: 10 } }
    ]);

    const finalData = [...new Map([...trendingProducts, ...products].map(item => [item._id.toString(), item])).values()]
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);

    return {
        status: finalData.length > 0,
        count: finalData.length,
        products: finalData
    };
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
                    { $limit: effectiveLimit }
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
};

/**
 * Get flash sale products.
 * @param {Object} config
 * @param {boolean} config.paginated - if true, paginates the "all" bucket (mobile); if false, returns flat (ecommerce)
 * @param {number} [config.page] - page number (only used when paginated)
 * @param {number} [config.limit] - items per page (only used when paginated)
 */
exports.getFlashSales = async ({ paginated, page, limit }) => {
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

    const allProductsFromDB = await Product.find(productQuery).lean();

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
        const totalCount = allProducts.length;
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

        return {
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

        return {
            status: true,
            flashSale: flashSale,
            data: formatted
        };
    }
};

/**
 * Get super saver products with high discounts.
 * @param {Object} config
 * @param {number} config.minItems - 20 for ecommerce, 8 for mobile
 */
exports.getSuperSaverProducts = async ({ minItems }) => {
    const ranges = { min: 1, max: 99 };
    const requiredCount = minItems;

    let superSaverProducts = [];
    const highestDiscountProduct = await Product.findOne({ isHighest: true });

    while (superSaverProducts.length < requiredCount) {
        const randomProducts = await Product.aggregate([
            {
                $match: {
                    $expr: {
                        $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                    }
                }
            },
            { $sample: { size: 2 } }
        ]);
        for (let product of randomProducts) {
            if (superSaverProducts.length >= requiredCount) break;

            const productWithDiscount = product;

            if (
                productWithDiscount.discount >= ranges.min &&
                productWithDiscount.discount <= ranges.max
            ) {
                superSaverProducts.push(productWithDiscount);
            }
        }
    }

    return {
        status: superSaverProducts.length > 0,
        count: superSaverProducts.length,
        highestDiscount: highestDiscountProduct.discount,
        products: superSaverProducts
    };
};

/**
 * Get favourites of the week based on sales in last 7 days.
 */
exports.favouritesOfWeek = async () => {
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
    }).lean();

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

    return { success: true, flashSale };
};
