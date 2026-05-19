'use strict';

/**
 * V2 Shared routes — served to both mobile and web clients.
 * Products, categories, wishlist, coupons, shipping, banners, verticals.
 *
 * Wave 3 renames applied:
 *   - /products/categories          → GET /categories
 *   - /products/categories/search   → GET /categories?q=:term  (same handler)
 *   - /products/category/:id        → GET /categories/:id/products
 *   - /products/sub-category/:id    → GET /categories/:id/products?depth=2
 *   - /products/sub-sub-category/:id→ GET /categories/:id/products?depth=3
 *   - /products/similar             → GET /products/:id/similar
 *   - /products/:id/my-review       → GET /products/:id/reviews/me
 *   - GET /coupons                  → GET /coupons/issuance-count
 *   - POST /coupons/apply auth.optional → auth.required
 *   - POST /wishlist                → POST /wishlist/items
 *   - DELETE /wishlist              → DELETE /wishlist/items/:productId
 *   - GET /shipping/cost            → GET /shipping/quote
 *   - POST /notify-me               → POST /notifications/subscriptions
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const homeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// 30 req/min/IP on coupon mutation endpoints — configurable via env in the future.
const couponLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const auth = require('../../../middleware/authV2');
const createUpload = require('../../../utilities/fileUpload');

const productCtrl = require('../../../controllers/v2/shared/productController');
const wishlistCtrl = require('../../../controllers/v2/shared/wishlistController');
const homeCtrl = require('../../../controllers/v2/shared/homeController');
const couponCtrl = require('../../../controllers/v2/shared/couponController');
const railCtrl = require('../../../controllers/v2/shared/railController');
const shippingCtrl = require('../../../controllers/v2/shared/shippingController');
const reviewCtrl = require('../../../controllers/v2/shared/reviewController');
const bannerCtrl = require('../../../controllers/v2/shared/bannerController');
const verticalsCtrl = require('../../../controllers/v2/shared/verticalsController');

const reviewUpload = createUpload(/jpeg|jpg|png|pdf/, 'uploads/users');

// ── Home manifest ──────────────────────────────────────────────────
router.get('/home', homeLimiter, homeCtrl.getHomeManifest);

// ── Rails (paginated) ─────────────────────────────────────────────
router.get('/rails/:railName', auth.optional(), railCtrl.getRail);

// ── Coupons ───────────────────────────────────────────────────────
// NOTE: /coupons/issuance-count and /coupons/eligible must be declared before
//       /coupons/:anything so the literal segments aren't swallowed by a param route.
router.get('/coupons/issuance-count', auth.optional(), couponCtrl.getIssuanceCount);
router.post('/coupons/validate', couponLimiter, auth.optional(), couponCtrl.validate);
router.post('/coupons/apply',    couponLimiter, auth.required(), couponCtrl.apply);
router.post('/coupons/release',  couponLimiter, auth.required(), couponCtrl.release);
router.post('/coupons/redeem',   couponLimiter, auth.required(), couponCtrl.redeem);
router.get('/coupons/eligible',  couponLimiter, auth.optional(), couponCtrl.eligible);

// ── Categories (top-level resource) ──────────────────────────────
// GET /categories?q=:term searches; without q returns full tree.
router.get('/categories', productCtrl.listCategories);
router.get('/categories/:id/products', productCtrl.listCategoryProducts);

// ── Products ──────────────────────────────────────────────────────
// Specific paths declared before `/products/:id` so the param route doesn't shadow them.
router.get('/products', productCtrl.getProducts);
router.post('/products/search', productCtrl.search);
// /products/:id/similar must come BEFORE /products/:id to avoid shadowing
router.get('/products/:id/similar', productCtrl.listSimilarProducts);
router.get('/products/:id', auth.optional(), productCtrl.getProductDetails);
router.get('/products/:id/reviews', auth.optional(), reviewCtrl.getProductReviews);
router.get('/products/:id/reviews/me', auth.required(), reviewCtrl.getMyProductReview);
router.post('/products/:id/reviews', auth.required(), reviewUpload.single('image'), reviewCtrl.submitProductReview);

// ── Shipping ──────────────────────────────────────────────────────
router.get('/shipping/countries', shippingCtrl.getCountries);
router.get('/shipping/countries/:code/cities', shippingCtrl.getCountryCities);
router.get('/shipping/quote', shippingCtrl.getQuote);

// ── Banners ───────────────────────────────────────────────────────
router.get('/banners', bannerCtrl.getBanners);

// ── Verticals ─────────────────────────────────────────────────────
router.get('/verticals', verticalsCtrl.list);

// ── Notifications (shared subscription endpoint) ──────────────────
// POST /notify-me → POST /notifications/subscriptions (Wave 3)
// Auth required (2026-05-19): mobile dropped its email TextField and now reads
// the subscriber email from req.user.email. Guests are routed to Sign In first.
router.post('/notifications/subscriptions', auth.required(), verticalsCtrl.subscribe);

// ── Wishlist ──────────────────────────────────────────────────────
router.get('/wishlist', auth.required(), wishlistCtrl.getWishlist);
router.post('/wishlist/items', auth.required(), wishlistCtrl.addItem);
router.delete('/wishlist/items/:productId', auth.required(), wishlistCtrl.removeItem);

module.exports = router;
