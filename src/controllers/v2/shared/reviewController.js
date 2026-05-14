'use strict';

/**
 * V2 Shared Review Controller
 * Handles product-scoped review endpoints for both mobile and web clients.
 */

const Review = require('../../../repositories').reviews.rawModel();
const Product = require('../../../repositories').products.rawModel();
const userService = require('../../../services/userService');
const { wrap, wrapError } = require('../_shared/responseEnvelope');
const { asyncHandler } = require('../../../middleware');
const logger = require('../../../utilities/logger');
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find a product by its UUID (product.id field) and return the Mongo doc.
 * Throws a domain-style error if not found.
 */
async function findProductByUuid(uuid) {
    const product = await Product.findOne({
        'product.id': uuid,
        $or: [
            { status: { $exists: false } },
            { status: true },
        ],
        discountedPrice: { $exists: true, $gt: 0 },
    });

    if (!product) {
        const err = new Error('Product not found');
        err.status = 404;
        throw err;
    }

    return product;
}

function mapReview(r) {
    return {
        id: r._id,
        productId: r.product_id,
        userId: r.user_id,
        name: r.nickname,
        description: r.summary,
        title: r.texttext,
        image: r.image,
        qualityRating: r.quality_rating,
        valueRating: r.value_rating,
        priceRating: r.price_rating,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
    };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * GET /v2/products/:id/reviews
 * Auth: optional — anonymous PDP access permitted.
 */
exports.getProductReviews = asyncHandler(async (req, res) => {
    const product = await findProductByUuid(req.params.id);
    const reviews = await Review.find({ product_id: product._id });
    const mapped = reviews.map(r => mapReview(r._doc || r));

    return res.status(200).json(wrap({
        productId: req.params.id,
        total: mapped.length,
        reviews: mapped,
    }));
});

/**
 * GET /v2/products/:id/my-review
 * Auth: required — returns the authenticated user's review for this product.
 */
exports.getMyProductReview = asyncHandler(async (req, res) => {
    const product = await findProductByUuid(req.params.id);
    const userId = req.user._id;
    const reviews = await Review.find({ product_id: product._id, user_id: userId });
    const mapped = reviews.map(r => mapReview(r._doc || r));

    return res.status(200).json(wrap({
        productId: req.params.id,
        total: mapped.length,
        reviews: mapped,
    }));
});

/**
 * POST /v2/products/:id/reviews
 * Auth: required — submit (create or update) a review for this product.
 * Multipart/form-data; optional `image` file field.
 */
exports.submitProductReview = asyncHandler(async (req, res) => {
    const { name, description, title, quality_rating, value_rating, price_rating } = req.body;

    if (!quality_rating && !value_rating && !price_rating) {
        return res.status(400).json(wrapError('VALIDATION_ERROR', 'At least one rating field is required (quality_rating, value_rating, or price_rating)'));
    }

    const product_id = req.params.id;

    let filePath;
    if (req.file) {
        filePath = `${FRONTEND_BASE_URL}/${req.file.path.replace(/\\/g, '/')}`;
    }

    const result = await userService.addReview(req.user._id, {
        productId: product_id,
        name,
        description,
        title,
        qualityRating: quality_rating,
        valueRating: value_rating,
        priceRating: price_rating,
    }, filePath);

    return res.status(200).json(wrap({ reviews: result.reviews }, result.message));
});
