/**
 * V2 Shared routes — served to both mobile and web clients.
 * Products, wishlist, public endpoints.
 */
const express = require('express');
const router = express.Router();
const auth = require('../../../middleware/authV2');
const createUpload = require('../../../utilities/fileUpload');

const productCtrl = require('../../../controllers/v2/shared/productController');
const wishlistCtrl = require('../../../controllers/v2/shared/wishlistController');
const recCtrl = require('../../../controllers/v2/shared/recommendationController');

const reviewUpload = createUpload(/jpeg|jpg|png|pdf/, 'uploads/users');

// ── Products ──────────────────────────────────────────────────────
router.get('/products/categories', productCtrl.getCategories);
router.get('/products', productCtrl.getProducts);
router.get('/products/:id', auth.optional(), productCtrl.getProductDetails);
router.post('/products/search', productCtrl.search);
router.get('/products/category/:id', productCtrl.categoriesProduct);
router.get('/products/sub-category/:id', productCtrl.subCategoriesProduct);
router.get('/products/sub-sub-category/:id', productCtrl.subSubCategoriesProduct);
router.get('/products/similar', productCtrl.similarProducts);

// ── Recommendations (Phase 1) ─────────────────────────────────────
router.get('/recommendations/trending', auth.optional(), recCtrl.trending);
router.get('/recommendations/for-you', auth.optional(), recCtrl.forYou);
router.get('/recommendations/similar/:productId', auth.optional(), recCtrl.similar);
router.get('/recommendations/frequently-bought/:productId', auth.optional(), recCtrl.frequentlyBought);
router.post('/recommendations/events', auth.optional(), recCtrl.logEvents);
router.get('/recommendations/experiments/:key/assign', auth.optional(), recCtrl.assign);
router.get('/recommendations/metrics', auth.required(), recCtrl.metrics);

// ── Wishlist ──────────────────────────────────────────────────────
router.get('/wishlist', auth.required(), wishlistCtrl.getWishlist);
router.post('/wishlist', auth.required(), wishlistCtrl.addToWishlist);
router.delete('/wishlist', auth.required(), wishlistCtrl.removeFromWishlist);

module.exports = router;
