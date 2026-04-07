const Product = require("../../models/Product");
const Review = require("../../models/Review");
const OrderDetail = require("../../models/OrderDetail");
const FlashSale = require("../../models/FlashSale");
const mongoose = require('mongoose');
const axios = require("axios");
const API_KEY = process.env.API_KEY;

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
                        $trim: { input: "$product.price_standard.tax_inclusive" },
                        },
                    },
                    },
                },
                {
                    $match: {
                    priceNum: { $gte: range.min, $lte: range.max },
                    },
                },
                {
                    $match: {
                    $expr: {
                        $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
                    }
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
                .filter((img) => {
                    if (typeof img !== "string" || !img.trim()) return false;
                    const lower = img.toLowerCase();

                    const hasExtension = /\.(jpg|jpeg|png|gif|webp|svg|bmp|jfif|tiff)(\?.*)?$/.test(lower);
                    return hasExtension;
                });

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
        discountedPrice: { $gte: startPrice, $lte: endPrice }
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

        return res.status(200).json({
            success: true,
            products,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: totalCount,
                productsPerPage: limit,
                priceRange: `${startPrice} - ${endPrice}`
            }
        });
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

        const finalData = [...new Map([...filteredTopProducts, ...products].map(item => [item._id.toString(), item])).values()].sort(() => Math.random() - 0.5).slice(0, 10);

        res.status(200).json({
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.trendingProducts = async (req, res) => {
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

        // const soldProductIds = soldProducts.map(p => new mongoose.Types.ObjectId(p._id));
        const soldProductIds = soldProducts.map(p => p._id);
        if (!soldProductIds.length) {
            return res.status(200).json({
                status: false,
                count: 0,
                products: []
            });
        }

        // const trendingProducts = await Product.find(
        //     { _id: { $in: soldProductIds } }
        // );

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

    const finalData = [...new Map([...filteredTrendingProducts, ...products].map(item => [item._id.toString(), item])).values()].sort(() => Math.random() - 0.5).slice(0, 10);

    res.status(200).json({
        status: finalData.length > 0,
        count: finalData.length,
        products: finalData
    });

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

        // const soldProductIds = soldProducts.map(p => new mongoose.Types.ObjectId(p._id));
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

        res.status(200).json({
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        });

    } catch (error) {
        console.error("Error in todayDeal:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getNewArrivals = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const MAX_ITEMS_FROM_DB = 200;
    const FIRST_PAGE_LIMIT = 55;
    const NEXT_PAGES_LIMIT = 55;
    const skip = page === 1 ? 0 : FIRST_PAGE_LIMIT + (page - 2) * NEXT_PAGES_LIMIT;
    const limit = page === 1 ? FIRST_PAGE_LIMIT : NEXT_PAGES_LIMIT;

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
                        { $skip: skip },
                        { $limit: limit }
                    ]
                }
            }
        ]);

        const totalCount = result[0].totalCount[0]?.count ?? 0;
        const products = result[0].products ?? [];
        const totalPages = totalCount <= FIRST_PAGE_LIMIT
            ? 1
            : 1 + Math.ceil((totalCount - FIRST_PAGE_LIMIT) / NEXT_PAGES_LIMIT);

        res.status(200).json({
            success: true,
            status: products.length > 0,
            count: products.length,
            products,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: totalCount,
                productsPerPage: limit,
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

exports.getFlashSales = async (req, res) => {
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

        const allProductsFromDB = await Product.find({
            status: true,
            totalQty: { $gt: 0 },
            sold: { $exists: true, $gt: 0 }
        }).lean();

        const productsWithImages = allProductsFromDB.filter(product => 
            product.product?.images && 
            Array.isArray(product.product.images) && 
            product.product.images.length > 0
        );

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

        for (let product of productsWithImages) {
            const productWithDiscount = product;
            const d = productWithDiscount.discount;

            const range = ranges.find(r => d >= r.min && d < r.max);
            if (range && discountBuckets[range.label].length < 10) {
                discountBuckets[range.label].push(productWithDiscount);
            }

            discountBuckets["all"].push(productWithDiscount);

            if (ranges.every(r => discountBuckets[r.label].length >= 10)) break;
        }

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

        return res.status(200).json({
            status: true,
            flashSale: flashSale,
            data: formatted
        });

    } catch (err) {
        console.error("Error in getFlashSales:", err);
        return res.status(500).json({ status: false, message: "Server error" });
    }
};

exports.getSuperSaverProducts = async (req, res) => {
    try {
        const ranges = { min: 1, max: 99 };
        const requiredCount = 20;

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

        return res.status(200).json({
            status: superSaverProducts.length > 0,
            count: superSaverProducts.length,
            highestDiscount: highestDiscountProduct.discount,
            products: superSaverProducts
        });
    } catch (err) {
        console.error("Error in getSuperSaverProducts:", err);
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

        // const soldProductIds = soldProducts.map(p => new mongoose.Types.ObjectId(p._id));
        const soldProductIds = soldProducts.map(p => p._id);
        if (!soldProductIds.length) {
            return res.status(200).json({
                status: false,
                count: 0,
                products: []
            });
        }

        // let products = await Product.find({
        //     _id: { $in: soldProductIds },
        //     totalQty: { $gt: 0 }
        // }).lean();

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

        const productsIten = await Product.aggregate([
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

        const finalData = [...new Map([...productsIten, ...favourites].map(item => [item._id.toString(), item])).values()].sort(() => Math.random() - 0.5).slice(0, 10);

        res.status(200).json({
            status: finalData.length > 0,
            count: finalData.length,
            products: finalData
        });

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

        res.json({ success: true, flashSale });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

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
        const Product = require('../../models/Product');

        // Only fetch products where status is explicitly true
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

        // Filter out products where status is not true or not found
        const records = products
            .filter(p => p.status === true)
            .map(p => ({
                name: p?.product?.name || '',
                description: stripHtml(p?.product?.description || ''),
                available: 'Yes', // Since we're only including status: true products
            }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

        res.write(csvStringifier.stringifyRecords(records));
        res.end();
    } catch (err) {
        console.error('Error exporting products availability:', err);
        res.status(500).json({ success: false, message: 'Failed to export products availability' });
    }
};

const getDubaiDateUTC = () => {
    // Return current UTC time - all comparisons should use UTC instants
    return new Date();
};

const getDubaiDate = () => {
    // Return current UTC time - all comparisons should use UTC instants
    return new Date();
};