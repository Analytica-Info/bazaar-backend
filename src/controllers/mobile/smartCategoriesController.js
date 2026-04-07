const Product = require("../../models/Product");
const Review = require("../../models/Review");
const Order = require("../../models/Order");
const OrderDetail = require("../../models/OrderDetail");
const ProductView = require("../../models/ProductView");
const FlashSale = require("../../models/FlashSale");
const mongoose = require('mongoose');
const fs = require("fs");
const path = require("path");

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

            let logContent = `\n---\n## 🚨 STATUS FALSE ITEM DETECTED\n\n`;
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
                console.log(`🚨 ALERT: ${falseStatusItems.length} items with status: false found in ${endpoint}`);
            } catch (fileError) {
                console.error('Error writing to status log file:', fileError);
            }
        }
    } catch (error) {
        console.error('Error in status logging:', error);
    }
};

exports.hotOffers = async (req, res) => {
    try {
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
                const products = await Product.aggregate([
                    {
                        $addFields: {
                            priceNum: {
                                $toDouble: {
                                $trim: { input: "$product.price_standard.tax_exclusive" },
                                },
                            },
                        },
                    },
                    {
                        $match: {
                            priceNum: { $gte: range.min, $lte: range.max },
                            "product.images": { $exists: true, $type: "array", $ne: [] },
                            $or: [
                                { status: { $exists: false } },
                                { status: true }
                            ],
                            discountedPrice: { $exists: true, $gt: 0 }
                        },
                    },
                    {
                        $project: {
                            images: "$product.images.sizes.original",
                        },
                    },
                    { $sample: { size: 20 } },
                ]);

                let photos = products
                .flatMap((p) => p.images || [])
                .filter(
                    (img) =>
                    typeof img === "string" &&
                    !img.toLowerCase().endsWith(".webp")
                );

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

    if (isNaN(startPrice) || isNaN(endPrice)) {
        return res.status(400).json({
            success: false,
            message: "Invalid price range parameters"
        });
    }

    let query = {
        totalQty: { $gt: 0 },
        $or: [
            { status: { $exists: false } },
            { status: true }
        ],
        discountedPrice: { $exists: true, $gt: 0, $gte: startPrice, $lte: endPrice }
    };

    try {
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

        const responseData = {
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

        logStatusFalseItems('/api/products/productsByPrice', req, res, responseData);

        return res.status(200).json(responseData);
    } catch (error) {
        console.error("Error fetching products by price:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching products by price"
        });
    }
};

exports.getTopRatedProducts = async (req, res) => {
    try {
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
                $match: {
                    "product.status": true,
                    "product.totalQty": { $gt: 0 },
                    "product.discountedPrice": { $exists: true, $gt: 0 }
                }
            },
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
                    totalQty: { $gt: 0 },
                    discountedPrice: { $exists: true, $gt: 0 }
                }
            },
            {
                $sample: { size: 10 }
            }
        ]);

        const finalData = [...new Map([...topProducts, ...products].map(item => [item._id.toString(), item])).values()]
            .filter(product =>
                product.product?.images &&
                Array.isArray(product.product.images) &&
                product.product.images.length > 0
            )
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);

        const responseData = {
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        };

        logStatusFalseItems('/api/products/getTopRatedProducts', req, res, responseData);

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.trendingProducts = async (req, res) => {
    try {
        const nowDubaiUTC = getDubaiDateUTC();
        const seventyTwoHoursAgoUTC = new Date(nowDubaiUTC.getTime() - 100 * 60 * 60 * 1000);

        const soldProducts = await OrderDetail.aggregate([
            { $match: { createdAt: { $gte: seventyTwoHoursAgoUTC } } },
            {
                $group: {
                    _id: "$product_id",
                    totalSold: { $sum: "$quantity" },
                },
            },
            { $match: { totalSold: { $gte: 1 } } },
            {
                $lookup: {
                    from: "products",
                    let: { productId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$product.id", "$$productId"] },
                                status: true,
                                totalQty: { $gt: 0 },
                                discountedPrice: { $exists: true, $gt: 0 }
                            }
                        }
                    ],
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $replaceRoot: { newRoot: "$product" }
            }
        ]);

        const trendingProducts = soldProducts;

        const products = await Product.aggregate([
            {
                $match: {
                    status: true,
                    totalQty: { $gt: 0 },
                    discountedPrice: { $exists: true, $gt: 0 }
                }
            },
            {
                $sample: { size: 10 }
            }
        ]);

        const finalData = [...new Map([...trendingProducts, ...products].map(item => [item._id.toString(), item])).values()]
            .filter(product => 
                product.product?.images && 
                Array.isArray(product.product.images) && 
                product.product.images.length > 0
            )
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);

        const responseData = {
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        };

        logStatusFalseItems('/api/products/trendingProducts', req, res, responseData);

        res.status(200).json(responseData);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.todayDeal = async (req, res) => {
    try {
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

        const soldProductIds = soldProducts.map(p => new mongoose.Types.ObjectId(p._id));

        let trendingProducts = [];
        if (soldProductIds.length) {
            trendingProducts = await Product.find({
                _id: { $in: soldProductIds },
                totalQty: { $gt: 0 },
                $or: [
                    { status: { $exists: false } },
                    { status: true }
                ],
                discountedPrice: { $exists: true, $gt: 0 }
            }).lean();

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
                    totalQty: { $gt: 0 },
                    discountedPrice: { $exists: true, $gt: 0 }
                }
            },
            { $sample: { size: 10 } }
        ]);

        const finalData = [...new Map([...trendingProducts, ...products].map(item => [item._id.toString(), item])).values()]
            .filter(product => 
                product.product?.images && 
                Array.isArray(product.product.images) && 
                product.product.images.length > 0
            )
            .sort(() => Math.random() - 0.5)
            .slice(0, 10);

        const responseData = {
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        };

        logStatusFalseItems('/api/products/todayDeal', req, res, responseData);

        res.status(200).json(responseData);

    } catch (error) {
        console.error("Error in todayDeal:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getNewArrivals = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 54;
    const MAX_ITEMS_FROM_DB = 200;

    try {
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
            { $limit: MAX_ITEMS_FROM_DB },
            {
                $facet: {
                    totalCount: [{ $count: "count" }],
                    products: [
                        { $skip: (page - 1) * limit },
                        { $limit: limit }
                    ]
                }
            }
        ]);

        const totalCount = result[0].totalCount[0]?.count ?? 0;
        const products = result[0].products ?? [];
        const totalPages = Math.ceil(totalCount / limit);

        const responseData = {
            status: products.length > 0,
            count: products.length,
            products,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: totalCount,
                productsPerPage: limit,
            }
        };

        logStatusFalseItems('/api/products/getNewArrivals', req, res, responseData);

        res.status(200).json(responseData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getFlashSales = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    try {
        const flashSale = await FlashSale.findOne().sort({ createdAt: -1 }).lean();
        if (!flashSale) {
            return res.status(200).json({ status: false, message: "No flash sale configured" });
        }

        if (!flashSale.isEnabled) {
            return res.status(200).json({
                status: false,
                flashSale,
                message: "Flash sale is currently disabled",
            });
        }

        const now = new Date();

        const startDateTime = new Date(`${flashSale.startDay}T${flashSale.startTime}:00+04:00`);
        const endDateTime = new Date(`${flashSale.endDay}T${flashSale.endTime}:00+04:00`);

        if (now < startDateTime || now > endDateTime) {
            return res.status(200).json({
                status: false,
                flashSale,
                message: "Flash sale not active currently",
            });
        }

        let allProductsFromDB = await Product.find({
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
            sold: { $exists: true, $gt: 0 },
            discountedPrice: { $exists: true, $gt: 0 }
        }).lean();

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

        const responseData = {
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

        logStatusFalseItems('/api/products/getFlashSales', req, res, responseData);

        return res.status(200).json(responseData);

    } catch (err) {
        console.error("Error in getFlashSales:", err);
        return res.status(500).json({ status: false, message: "Server error" });
    }
};

exports.favouritesOfWeek = async (req, res) => {
    try {
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

        if (!soldProducts.length) {
            return res.status(200).json({
                status: false,
                count: 0,
                products: []
            });
        }

        const objectIds = [];
        const uuids = [];

        for (const p of soldProducts) {
            const id = p._id;
            if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
                objectIds.push(new mongoose.Types.ObjectId(id));
            } else {
                uuids.push(id);
            }
        }

        const productIdOr = [];

        if (objectIds.length) {
            productIdOr.push({ _id: { $in: objectIds } });
        }
        if (uuids.length) {
            productIdOr.push({ "product.id": { $in: uuids } });
        }

        const query = {
            totalQty: { $gt: 0 },
            $and: [
                {
                    $or: [
                        { status: { $exists: false } },
                        { status: true }
                    ]
                }
            ],
            discountedPrice: { $exists: true, $gt: 0 }
        };

        if (productIdOr.length > 0) {
            query.$and.push({ $or: productIdOr });
        }

        let products = await Product.find(query).lean();

        const soldMap = Object.fromEntries(soldProducts.map(s => [s._id.toString(), s.totalSold]));
        products.sort((a, b) => {
            const soldA = soldMap[a._id?.toString() || a.product?.id] || 0;
            const soldB = soldMap[b._id?.toString() || b.product?.id] || 0;
            if (soldB !== soldA) return soldB - soldA;
            return (b.discount || 0) - (a.discount || 0);
        });

        const favourites = products.slice(0, 20);

        const randomProducts = await Product.aggregate([
            {
                $match: {
                    status: true,
                    totalQty: { $gt: 0 },
                    discountedPrice: { $exists: true, $gt: 0 }
                }
            },
            { $sample: { size: 10 } }
        ]);

        const finalData = [
            ...new Map([...randomProducts, ...favourites].map(item => [item._id.toString(), item])).values()
        ]
        .filter(product => 
            product.product?.images && 
            Array.isArray(product.product.images) && 
            product.product.images.length > 0
        )
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);

        const responseData = {
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        };

        logStatusFalseItems('/api/products/favouritesOfWeek', req, res, responseData);

        res.status(200).json(responseData);

    } catch (error) {
        console.error("Error in favouritesOfWeek:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.storeFlashSales = async (req, res) => {
    try {
        const { startDay, startTime, endDay, endTime, isEnabled } = req.body;

        if (!startDay || !startTime || !endDay || !endTime) {
            return res.status(400).json({ success: false, message: "All fields required" });
        }

        let flashSale = await FlashSale.findOne();
        if (flashSale) {
            flashSale.startDay = startDay;
            flashSale.startTime = startTime;
            flashSale.endDay = endDay;
            flashSale.endTime = endTime;
            flashSale.isEnabled = isEnabled;
            await flashSale.save();
        } else {
            flashSale = await FlashSale.create({ startDay, startTime, endDay, endTime, isEnabled });
        }

        res.json({ success: true, flashSale });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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

exports.getSuperSaverProducts = async (req, res) => {
    try {
        const ranges = { min: 1, max: 99 };
        const requiredCount = 8;

        let superSaverProducts = [];
        const highestDiscountProduct = await Product.findOne({ 
            isHighest: true,
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
            discountedPrice: { $exists: true, $gt: 0 }
        });

        while (superSaverProducts.length < requiredCount) {
            const randomProducts = await Product.aggregate([
                {
                    $match: {
                        $or: [
                            { status: { $exists: false } },
                            { status: true }
                        ],
                        discountedPrice: { $exists: true, $gt: 0 }
                    }
                },
                { $sample: { size: 2 } }
            ]);
            for (let product of randomProducts) {
                if (superSaverProducts.length >= requiredCount) break;

                if (!product.product?.images || !Array.isArray(product.product.images) || product.product.images.length === 0) {
                    continue;
                }

                const productWithDiscount = product;

                if (
                    productWithDiscount.discount >= ranges.min &&
                    productWithDiscount.discount <= ranges.max
                ) {
                    superSaverProducts.push(productWithDiscount);
                }
            }
        }

        const responseData = {
            status: superSaverProducts.length > 0,
            count: superSaverProducts.length,
            highestDiscount: highestDiscountProduct.discount,
            products: superSaverProducts
        };

        logStatusFalseItems('/api/products/getSuperSaverProducts', req, res, responseData);

        return res.status(200).json(responseData);
    } catch (err) {
        console.error("Error in getSuperSaverProducts:", err);
        return res.status(500).json({ status: false, message: "Server error" });
    }
};

const getDubaiDateUTC = () => {
    const dubaiNow = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })
    );
    return new Date(dubaiNow.getTime());
};

const getDubaiDate = () => {
    return new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })
    );
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