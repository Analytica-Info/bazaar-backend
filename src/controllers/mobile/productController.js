const fs = require("fs");
const path = require("path");
const Category = require("../../models/Category");
const Product = require("../../models/Product");
const Review = require("../../models/Review");
const ProductView = require("../../models/ProductView");

const productService = require("../../services/productService");

const logger = require("../../utilities/logger");
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

// ─── Thin wrapper helper ─────────────────────────────────────────
// Service functions throw { status, message } on error.
// This helper catches those and sends the matching HTTP response.
function handleServiceError(res, error) {
    const status = error.status || 500;
    const body = error.message
        ? { message: error.message, ...(error.data || {}) }
        : { message: "Internal server error" };
    return res.status(status).json(body);
}

// ─── Product wrappers (delegated to productService) ──────────────

exports.getCategories = async (req, res) => {
    try {
        const result = await productService.getCategories();
        return res.status(200).json(result);
    } catch (error) {
        return handleServiceError(res, error);
    }
};

exports.getSearchCategories = async (req, res) => {
    try {
        const result = await productService.getSearchCategories(req.body);
        return res.status(200).json(result);
    } catch (error) {
        return handleServiceError(res, error);
    }
};

exports.products = async (req, res) => {
    try {
        const result = await productService.getProducts(req.query);
        return res.status(200).json(result);
    } catch (error) {
        return handleServiceError(res, error);
    }
};

exports.productsDetails = async (req, res) => {
    const { id } = req.params;
    const userId = req.user?._id || null;
    try {
        const result = await productService.getProductDetails(id, userId);
        return res.json(result);
    } catch (error) {
        return handleServiceError(res, error);
    }
};

exports.searchProduct = async (req, res) => {
    try {
        const result = await productService.searchProducts(req.body);
        return res.json(result);
    } catch (error) {
        if (error.status && error.data) {
            return res.status(error.status).json({
                message: error.message,
                ...error.data,
            });
        }
        return handleServiceError(res, error);
    }
};

exports.search = async (req, res) => {
    try {
        const result = await productService.searchProducts(req.body);
        return res.json(result);
    } catch (error) {
        if (error.status && error.data) {
            return res.status(error.status).json({
                message: error.message,
                ...error.data,
            });
        }
        return handleServiceError(res, error);
    }
};

exports.categoriesProduct = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await productService.getCategoriesProduct(id, req.query);
        return res.json(result);
    } catch (error) {
        return handleServiceError(res, error);
    }
};

exports.subCategoriesProduct = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await productService.getSubCategoriesProduct(id, req.query);
        return res.json(result);
    } catch (error) {
        return handleServiceError(res, error);
    }
};

exports.subSubCategoriesProduct = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await productService.getSubSubCategoriesProduct(id, req.query);
        return res.json(result);
    } catch (error) {
        return handleServiceError(res, error);
    }
};

exports.similarProducts = async (req, res) => {
    const { product_type_id, id } = req.query;
    try {
        const result = await productService.getSimilarProducts(product_type_id, id);
        return res.json(result);
    } catch (error) {
        return handleServiceError(res, error);
    }
};

// ─── Review functions (kept inline — small, no dedicated service) ─

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
        logger.error({ err: error }, "Error fetching reviews:");
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
        logger.error({ err: error }, "Error fetching reviews:");
        res.status(500).json({ error: error.message });
    }
};
