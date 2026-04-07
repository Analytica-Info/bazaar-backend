const fs = require("fs");
const path = require("path");
const Category = require("../../models/Category");
const Product = require("../../models/Product");
const Review = require("../../models/Review");
const ProductView = require("../../models/ProductView");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 1800 });
const axios = require("axios");

// Status logging utility - common function
const logStatusFalseItems = (endpoint, req, res, responseData) => {
    try {
        // Check if response contains products array or single product
        let products = [];
        if (responseData && typeof responseData === 'object') {
            if (responseData.products) products = responseData.products;
            else if (responseData.filteredProducts) products = responseData.filteredProducts;
            else if (responseData.data && responseData.data.products) products = responseData.data.products;
            // Handle flash sales nested structure
            else if (responseData.data && Array.isArray(responseData.data)) {
                responseData.data.forEach(item => {
                    if (item.products && Array.isArray(item.products)) {
                        products = products.concat(item.products);
                    }
                });
            }
            // Handle single product response
            else if (responseData.product && responseData.id) {
                products = [responseData];
            }
            else if (Array.isArray(responseData)) products = responseData;
        }

        // Find items with status: false
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

            // Append to log file with try-catch
            try {
                if (fs.existsSync(logFilePath)) {
                    fs.appendFileSync(logFilePath, logContent);
                } else {
                    fs.writeFileSync(logFilePath, `# Status False Items Log\n\n${logContent}`);
                }
                console.log(`🚨 ALERT: ${falseStatusItems.length} items with status: false found in ${endpoint}`);
            } catch (fileError) {
                console.error('Error writing to status log file:', fileError);
                // Don't throw error, just log it
            }
        }
    } catch (error) {
        console.error('Error in status logging:', error);
    }
};

const API_KEY = process.env.API_KEY;
const CATEGORIES_URL = process.env.CATEGORIES_URL;
const PRODUCT_TYPE = process.env.PRODUCT_TYPE;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find();
        if (categories.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No categories found.",
            });
        }

        return res.status(200).json({
            success: true,
            side_bar_categories: categories[0].side_bar_categories,
            search_categoriesList: categories[0].search_categoriesList,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching categories.",
        });
    }
};

exports.getSearchCategories = async (req, res) => {
    try {
        const { category_name } = req.body;
        const searchTerm = (category_name || "").toLowerCase();

        const categories = await Category.find();

        if (categories.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No categories found.",
            });
        }

        const matchedCategories = categories[0].side_bar_categories.filter(
            (category) => category.name.toLowerCase().includes(searchTerm)
        );

        return res.status(200).json({
            success: true,
            side_bar_categories: matchedCategories,
            search_categoriesList: categories[0].search_categoriesList,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching categories.",
        });
    }
};

exports.products = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 54;
    const filter = req.query.filter;

    // let query = { totalQty: { $gt: 0 } };
    let query = {
    totalQty: { $gt: 0 },
        $or: [
            { status: { $exists: false } },  
            { status: true }
        ],
        discountedPrice: { $exists: true, $gt: 0 }
    };

    if (filter && filter.length > 0) {
        const filterWords = JSON.parse(filter);
        const words = filterWords.map((word) => word.toLowerCase());

        const filterQuery = {
            $or: words.map((word) => ({
                "variantsData.sku": {
                $regex: `^${word} - .*`,
                $options: "i",
                },
            })),
        };

        query = { $and: [query, filterQuery] };
    }
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
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: totalCount,
                productsPerPage: limit,
            },
            products,
        };

        // Log status false items if any
        logStatusFalseItems('/api/products/products', req, res, responseData);

        return res.status(200).json(responseData);
    } catch (error) {
        console.error("Error fetching products:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching products",
        });
    }
};

exports.productsDetails = async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;
    try {
        const product = await Product.findOne({ 
            "product.id": id,
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
            discountedPrice: { $exists: true, $gt: 0 }
        });
        const reviews = await Review.find({ product_id: product._id });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "No product found.",
            });
        }

        let totalQuality = 0;
        let totalValue = 0;
        let totalPrice = 0;

        const count = reviews.length;

        for (const review of reviews) {
            totalQuality += review.quality_rating || 0;
            totalValue += review.value_rating || 0;
            totalPrice += review.price_rating || 0;
        }

        const avgQuality = count ? (totalQuality / count).toFixed(1) : 0;
        const avgValue = count ? (totalValue / count).toFixed(1) : 0;
        const avgPrice = count ? (totalPrice / count).toFixed(1) : 0;

        await trackProductView(product._id, userId);
        const result = await ProductView.aggregate([
            { $match: { product_id: product._id } },
            { $group: { _id: null, totalViews: { $sum: "$views" } } }
        ]);

        const totalViews = result[0]?.totalViews || 0;

        const responseData = {
            id: product._id,
            product: product.product,
            variantsData: product.variantsData,
            totalQty: product.totalQty,
            reviews: reviews,
            reviewsCount: reviews.length,
            avgQuality: avgQuality,
            avgValue: avgValue,
            avgPrice: avgPrice,
            total_view: totalViews,
        };

        logStatusFalseItems('/api/products/productsDetails', req, res, responseData);

        return res.json(responseData);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching product.",
        });
    }
};

exports.searchProduct = async (req, res) => {
    const { item_name, category_id } = req.body;
  
    try {
        if (!item_name || item_name.length < 3) {
            return res.status(400).json({ message: "Search term must be at least 3 characters long" });
        }
        const searchTerms = item_name.trim().split(/\s+/);
        let query = {
            $and: [
            {
                $and: searchTerms.map(term => ({
                $or: [
                    { "product.name": { $regex: term, $options: "i" } },
                    { "product.description": { $regex: term, $options: "i" } }
                    ]
                }))
            },
            { "totalQty": { $gt: 0 } },
            {
                $or: [
                    { status: { $exists: false } },
                    { status: true }
                ]
            },
            { "discountedPrice": { $exists: true, $gt: 0 } }
            ]
        };
  
        if (category_id) {
            query["product.product_type_id"] = category_id;
        }
  
        let filteredProducts = await Product.find(query);
        
        // Filter products with images
        filteredProducts = filteredProducts.filter(product => 
            product.product?.images && 
            Array.isArray(product.product.images) && 
            product.product.images.length > 0
        );
        
        const noResult = filteredProducts.length === 0;

        if (noResult) {
            query = {
                totalQty: { $gt: 0 },
                $or: [
                    { status: { $exists: false } },
                    { status: true }
                ]
            };
    
            if (category_id) {
                query["product.product_type_id"] = category_id;
            }
    
            filteredProducts = [];
        }

        const responseData = {
            noResult,
            filteredProductsCount: filteredProducts.length,
            filteredProducts
        };

        // Log status false items if any
        logStatusFalseItems('/api/products/search-product', req, res, responseData);

        res.json(responseData);
    } catch (error) {
        console.error("Error processing the request:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
};

exports.search = async (req, res) => {
    const { category_id, sub_category_id, variant_category, min, max, sort } = req.body;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 54;

    try {
        let products = [];

        if (category_id) {
            const data = await categoriesProduct(category_id);
            products = data.filteredProducts || [];
        } else {
            products = await Product.find({ 
                totalQty: { $gt: 0 }, 
                status: true,
                discountedPrice: { $exists: true, $gt: 0 }
            }).lean();
        }

        if (min != null && max != null) {
            products = products.filter(p => {
                const price = p.discountedPrice || 0;
                return price >= min && price <= max;
            });
        }

        let allowedSkus = [];
        if (variant_category === "orange") {
            allowedSkus = ["Slightly Used - UAE Specs", "Slightly Used - Converted to UAE Specs"];
        } else if (variant_category === "yellow") {
            allowedSkus = ["Open Box - UAE Specs", "Open Box - Converted to UAE Specs"];
        } else if (variant_category === "green") {
            allowedSkus = ["New - UAE Specs", "New - Converted to UAE Specs"];
        } else if (variant_category === "red") {
            allowedSkus = ["Used - UAE Specs", "Used - Converted to UAE Specs"];
        }

        if (allowedSkus.length > 0) {
            products = products.filter(p =>
                Array.isArray(p.variantsData) &&
                p.variantsData.some(v => allowedSkus.includes(v.sku))
            );
        }

        // Filter products with images
        products = products.filter(product => 
            product.product?.images && 
            Array.isArray(product.product.images) && 
            product.product.images.length > 0
        );

        if (sort === 'lowToHigh') {
            products.sort((a, b) => (a.discountedPrice || 0) - (b.discountedPrice || 0));
        } else if (sort === 'highToLow') {
            products.sort((a, b) => (b.discountedPrice || 0) - (a.discountedPrice || 0));
        }

        const totalCount = products.length;
        const totalPages = Math.ceil(totalCount / limit);
        const paginatedProducts = products.slice((page - 1) * limit, page * limit);

        const responseData = {
            success: true,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: totalCount,
                productsPerPage: limit,
            },
            filteredProductsCount: paginatedProducts.length,
            filteredProducts: paginatedProducts
        };

        // Log status false items if any
        logStatusFalseItems('/api/products/search', req, res, responseData);

        res.json(responseData);

    } catch (error) {
        console.error("Error processing the request:", error);
        res.status(500).json({ error: "An error occurred while processing the request" });
    }
};

async function categoriesProduct(id) {
    try {
        let categories = await Category.find();
        categories = categories[0].side_bar_categories;
        const categoriesTypes = await fetchCategoriesType(id);
        const products = await Product.find({ 
            totalQty: { $gt: 0 }, 
            status: true,
            discountedPrice: { $exists: true, $gt: 0 }
        }).lean();

        function collectCategoryIds(categoryNode) {
            let ids = [categoryNode.id];
            if (Array.isArray(categoryNode.sub_categories) && categoryNode.sub_categories.length > 0) {
                for (let sub of categoryNode.sub_categories) {
                    ids = ids.concat(collectCategoryIds(sub));
                }
            }
            return ids;
        }

        let selectedCategory = categories.find(cat => cat.id === id);
        if (!selectedCategory) {
            return {
                categories: null,
                categoryId: id,
                filteredProductsCount: 0,
                filteredProducts: []
            };
        }


        const categoryIds = collectCategoryIds(selectedCategory);

        let mappedCategories = null;
        if (
            categoriesTypes &&
            categoriesTypes.data &&
            Array.isArray(categoriesTypes.data.category_path)
        ) {
            mappedCategories = categoriesTypes.data.category_path.map(cat => ({
                id: cat.id,
                name: cat.name
            }));
        }

        const filteredProducts = products.filter(product =>
            categoryIds.includes(product.product.product_type_id) &&
            product.totalQty > 0 &&
            product.product?.images &&
            Array.isArray(product.product.images) &&
            product.product.images.length > 0
        );

        return {
            categories: mappedCategories,
            categoryId: id,
            filteredProductsCount: filteredProducts.length,
            filteredProducts
        };
    } catch (error) {
        console.error("Error fetching categories or products:", error);
        return {
            filteredProductsCount: 0,
            filteredProducts: []
        };
    }
}
  
async function subCategoriesProduct(id) {
    try {
        let categories = await fetchAndCacheCategories();
        const categoriesTypes = await fetchCategoriesType(id);
        const products = await Product.find({ 
            totalQty: { $gt: 0 }, 
            status: true,
            discountedPrice: { $exists: true, $gt: 0 }
        }).lean();
  
        const categoryIds = [];
  
        categories.forEach((category) => {
            if (category.category_path[1] && category.category_path[1].id === id) {
                category.category_path.forEach((path) => {
                    categoryIds.push(path.id);
                });
            }
        });
    
        if (
            categoriesTypes &&
            categoriesTypes.data &&
            Array.isArray(categoriesTypes.data.category_path) &&
            categoriesTypes.data.category_path.length > 0
        ) {
            const categoryPath = categoriesTypes.data.category_path;
            categories = categoryPath.map((category) => {
                return {
                    id: category.id,
                    name: category.name,
                };
            });
        } else {
            categories = null;
        }
    
        const uniqueCategoryIds = [...new Set(categoryIds)];
    
        const filteredProducts = products.filter((product) => {
            return (
                uniqueCategoryIds.includes(product.product.product_type_id) &&
                product.totalQty > 0 &&
                product.product?.images &&
                Array.isArray(product.product.images) &&
                product.product.images.length > 0
            );
        });
        const filteredProductsCount = filteredProducts.length;
    
        return {
            categories,
            categoryId: id,
            filteredProductsCount,
            filteredProducts,
        };
    } catch (error) {
        console.error("Error fetching categories or products:", error);
        return {
            filteredProductsCount: 0,
            filteredProducts: [],
        };
    }
};

exports.categoriesProduct = async (req, res) => {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    try {
        let categories = await fetchAndCacheCategories();
        const categoriesTypes = await fetchCategoriesType(id);
        const products = await Product.find({ 
            totalQty: { $gt: 0 }, 
            status: true,
            discountedPrice: { $exists: true, $gt: 0 }
        }).lean();
    
        const categoryIds = [];
    
        categories.forEach((category) => {
            if (category.category_path[0] && category.category_path[0].id === id) {
                category.category_path.forEach((path) => {
                    categoryIds.push(path.id);
                });
            }
        });
    
        if (
            categoriesTypes &&
            categoriesTypes.data &&
            Array.isArray(categoriesTypes.data.category_path) &&
            categoriesTypes.data.category_path.length > 0
        ) {
            const categoryPath = categoriesTypes.data.category_path;
            categories = categoryPath.map((category) => {
                return {
                    id: category.id,
                    name: category.name,
                };
            });
        } else {
            categories = null;
        }
    
        const uniqueCategoryIds = [...new Set(categoryIds)];
    
        const filteredProducts = products.filter((product) =>
            uniqueCategoryIds.includes(product.product.product_type_id) &&
            product.totalQty > 0 &&
            product.product?.images &&
            Array.isArray(product.product.images) &&
            product.product.images.length > 0
        );

        const filteredProductsCount = filteredProducts.length;
        const totalPages = Math.ceil(filteredProductsCount / limit);
        const paginatedProducts = filteredProducts.slice((page - 1) * limit, page * limit);

        const responseData = {
            success: true,
            categories,
            categoryId: id,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: filteredProductsCount,
                productsPerPage: limit,
            },
            filteredProductsCount,
            filteredProducts: paginatedProducts,
        };

        // Log status false items if any
        logStatusFalseItems('/api/products/categoriesProduct', req, res, responseData);

        res.json(responseData);
    } catch (error) {
        console.error("Error fetching categories or products:", error);
        res.status(500).json({ error: "Failed to fetch categories or products" });
    }
};
  
exports.subCategoriesProduct = async (req, res) => {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    try {
        let categories = await fetchAndCacheCategories();
        const categoriesTypes = await fetchCategoriesType(id);
        const products = await Product.find({ 
            totalQty: { $gt: 0 }, 
            status: true,
            discountedPrice: { $exists: true, $gt: 0 }
        }).lean();
  
        const categoryIds = [];
  
        categories.forEach((category) => {
            if (category.category_path[1] && category.category_path[1].id === id) {
                category.category_path.forEach((path) => {
                    categoryIds.push(path.id);
                });
            }
        });
    
        if (
            categoriesTypes &&
            categoriesTypes.data &&
            Array.isArray(categoriesTypes.data.category_path) &&
            categoriesTypes.data.category_path.length > 0
        ) {
            const categoryPath = categoriesTypes.data.category_path;
            categories = categoryPath.map((category) => {
                return {
                    id: category.id,
                    name: category.name,
                };
            });
        } else {
            categories = null;
        }
    
        const uniqueCategoryIds = [...new Set(categoryIds)];
    
        const filteredProducts = products.filter((product) => {
            return (
                uniqueCategoryIds.includes(product.product.product_type_id) &&
                product.totalQty > 0 &&
                product.product?.images &&
                Array.isArray(product.product.images) &&
                product.product.images.length > 0
            );
        });
        const filteredProductsCount = filteredProducts.length;
        const totalPages = Math.ceil(filteredProductsCount / limit);
        const paginatedProducts = filteredProducts.slice((page - 1) * limit, page * limit);

        const responseData = {
            success: true,
            categories,
            categoryId: id,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: filteredProductsCount,
                productsPerPage: limit,
            },
            filteredProductsCount,
            filteredProducts: paginatedProducts,
        };

        // Log status false items if any
        logStatusFalseItems('/api/products/subCategoriesProduct', req, res, responseData);

        res.json(responseData);
    } catch (error) {
        console.error("Error fetching categories or products:", error);
        res.status(500).json({ error: "Failed to fetch categories or products" });
    }
};

exports.subSubCategoriesProduct = async (req, res) => {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    try {
        let categories = [];
        let products = await Product.find({ totalQty: { $gt: 0 }, status: true }).lean();
        const categoriesTypes = await fetchCategoriesType(id);
    
        const filteredProducts = products.filter(
            (product) =>
            product.product.product_type_id !== null &&
            product.product.product_type_id === id &&
            product.totalQty > 0 &&
            product.product?.images &&
            Array.isArray(product.product.images) &&
            product.product.images.length > 0
        );
    
        if (
            categoriesTypes &&
            categoriesTypes.data &&
            Array.isArray(categoriesTypes.data.category_path) &&
            categoriesTypes.data.category_path.length > 0
        ) {
            const categoryPath = categoriesTypes.data.category_path;
            categories = categoryPath.map((category) => {
                return {
                    id: category.id,
                    name: category.name,
                };
            });
        } else {
            categories = null;
        }
    
        const filteredProductsCount = filteredProducts.length;
        const totalPages = Math.ceil(filteredProductsCount / limit);
        const paginatedProducts = filteredProducts.slice((page - 1) * limit, page * limit);

        const responseData = {
            success: true,
            categories,
            categoryId: id,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts: filteredProductsCount,
                productsPerPage: limit,
            },
            filteredProductsCount,
            filteredProducts: paginatedProducts,
        };

        // Log status false items if any
        logStatusFalseItems('/api/products/subSubCategoriesProduct', req, res, responseData);

        res.json(responseData);
    } catch (error) {
        console.error("Error fetching categories or products:", error);
        res.status(500).json({ error: "Failed to fetch categories or products" });
    }
};

async function fetchCategoriesType(id) {
    try {
        const categoriesResponse = await axios.get(PRODUCT_TYPE + "/" + id, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                Accept: "application/json",
            },
        });
        return categoriesResponse.data || [];
    } catch (error) {
        console.warn("Error fetching products from Lightspeed:", error.message);
        return [];
    }
}

async function fetchAndCacheCategories() {
    const cacheKey = "lightspeed_categories";
  
    try {
        const cachedCategories = cache.get(cacheKey);
        if (cachedCategories) {
            console.log("Fetching categories from cache");
            return cachedCategories;
        }
  
        console.log("Fetching categories from Lightspeed API");
    
        const categoriesResponse = await axios.get(CATEGORIES_URL, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                Accept: "application/json",
            },
        });
  
        const categories = categoriesResponse.data.data?.data?.categories || [];
    
        cache.set(cacheKey, categories);
    
        return categories;
    } catch (error) {
        console.warn("Error fetching categories from Lightspeed:", error.message);
    
        if (error.response && error.response.status >= 500) {
            throw new Error("Server error while fetching categories");
        }
    
        throw new Error("Failed to fetch categories");
    }
}  

async function trackProductView(productId, userId = null) {
    try {
        const filter = { product_id: productId, user_id: userId };
        const existingView = await ProductView.findOne(filter);

        if (!existingView) {
            await ProductView.create({
                product_id: productId,
                user_id: userId,
                views: 1,
                lastViewedAt: new Date()
            });
        } else {
            await ProductView.updateOne(filter, {
                $inc: { views: 1 },
                $set: { lastViewedAt: new Date() }
            });
        }

    } catch (error) {
        console.error("Error tracking product view:", error.message);
    }
};

exports.addReview = async (req, res) => {
    try {
        const {
            name,
            description,
            title,
            product_id,
            quality_rating,
            value_rating,
            price_rating,
        } = req.body;

        const user_id = req.user._id;

        let file = '';
        if (req.file) {
            file = req.file.path.replace(/\\/g, "/");
        }

        const existingReview = await Review.findOne({ user_id, product_id });

        if (existingReview) {
            existingReview.nickname = name;
            existingReview.summary = description;
            existingReview.texttext = title;
            existingReview.quality_rating = quality_rating;
            existingReview.value_rating = value_rating;
            existingReview.price_rating = price_rating;
            if (file) existingReview.image = file;

            await existingReview.save();
        } else {
            await Review.create({
                user_id,
                nickname: name,
                summary: description,
                texttext: title,
                image: file,
                product_id,
                quality_rating,
                value_rating,
                price_rating,
            });
        }

        const reviews = await Review.find();
        const mappedReviews = reviews.map(r => ({
            ...r._doc,
            name: r.nickname,
            description: r.summary,
            title: r.texttext,
        }));

        res.json({
            message: existingReview
                ? "Review updated successfully"
                : "Review created successfully",
            reviews: mappedReviews,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

exports.review = async (req, res) => {
    const { id } = req.params;

    try {
        const product = await Product.findOne({ 
            "product.id": id,
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
            discountedPrice: { $exists: true, $gt: 0 }
        });
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found.",
            });
        }

        const reviews = await Review.find({ product_id: product._id });
        const mappedReviews = reviews.map(r => ({
            ...r._doc,
            name: r.nickname,
            description: r.summary,
            title: r.texttext,
        }));

        res.json({
            message: "Reviews fetched successfully",
            product_id: id,
            total: mappedReviews.length,
            reviews: mappedReviews,
        });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.UserReview = async (req, res) => {
    const { id } = req.params;
    const user_id = req.user._id;

    try {
        // First find the product by UUID (product.id)
        const product = await Product.findOne({ 
            "product.id": id,
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
            discountedPrice: { $exists: true, $gt: 0 }
        });
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found.",
            });
        }

        // Use product._id (ObjectId) to query reviews
        const reviews = await Review.find({ product_id: product._id, user_id });
        const mappedReviews = reviews.map(r => ({
            ...r._doc,
            name: r.nickname,
            description: r.summary,
            title: r.texttext,
        }));

        res.json({
            message: "Reviews fetched successfully",
            product_id: id,
            user_id: user_id,
            total: mappedReviews.length,
            reviews: mappedReviews,
        });
    } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.categoryImages = async (req, res) => {
    try {
        const { id, type } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: "Image file is required" });
        }

        let newFile = req.file.path.replace(/\\/g, "/");
        newFile = `${FRONTEND_BASE_URL}/${newFile}`;

        const category = await Category.findOne({ "side_bar_categories.id": id });
        if (!category) {
            return res.status(404).json({ message: "Sidebar category not found" });
        }

        const sidebarItem = category.side_bar_categories.find(item => item.id === id);
        if (sidebarItem && sidebarItem[type]) {
            const oldPath = path.resolve(sidebarItem[type]);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        const updateField = {};
        updateField[`side_bar_categories.$.${type}`] = newFile;

        const updatedCategory = await Category.findOneAndUpdate(
            { "side_bar_categories.id": id },
            { $set: updateField },
            { new: true }
        );

        res.json({
            message: `${type} updated successfully`,
            category: updatedCategory,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

exports.similarProducts = async (req, res) => {
    const { product_type_id, id } = req.query;
    const productId = id;

    try {
        if (!product_type_id || product_type_id.trim() === "") {
            return res.status(400).json({ error: "Product type ID is required" });
        }

        const escapedId = product_type_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const products = await Product.find({
            $or: [
                { status: { $exists: false } },
                { status: true }
            ],
            "product.product_type_id": { $regex: escapedId, $options: "i" },
            variantsData: { $exists: true, $ne: [] },
            discountedPrice: { $exists: true, $gt: 0 }
        });

        const filteredProducts = products.filter((product) => {
            if (productId && product._id.toString() === productId.toString()) {
                return false;
            }

            return (
                product.variantsData &&
                product.variantsData.length > 0 &&
                product.product?.images &&
                Array.isArray(product.product.images) &&
                product.product.images.length > 0
            );
        });

        const getRandomItems = (array, count) => {
            const shuffled = array.sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count);
        };

        const similarProducts = getRandomItems(filteredProducts, 20);

        const responseData = { similarProducts };

        logStatusFalseItems('/api/products/similarProducts', req, res, responseData);

        return res.json(responseData);
    } catch (error) {
        console.error("Error fetching similar products:", error.message);
        return res.status(500).json({ error: "Failed to fetch similar products" });
    }
};