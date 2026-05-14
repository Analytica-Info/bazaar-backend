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
const homeCtrl = require('../../../controllers/v2/shared/homeController');
const couponCtrl = require('../../../controllers/v2/shared/couponController');
const railCtrl = require('../../../controllers/v2/shared/railController');
const shippingCtrl = require('../../../controllers/v2/shared/shippingController');
const reviewCtrl = require('../../../controllers/v2/shared/reviewController');

const reviewUpload = createUpload(/jpeg|jpg|png|pdf/, 'uploads/users');

// ── Home manifest ──────────────────────────────────────────────────
router.get('/home', homeCtrl.getHomeManifest);

// ── Rails (paginated) ─────────────────────────────────────────────
router.get('/rails/:railName', auth.optional(), railCtrl.getRail);

// ── Coupons ───────────────────────────────────────────────────────
router.get('/coupons', auth.optional(), couponCtrl.getCoupons);
router.post('/coupons/validate', auth.optional(), couponCtrl.validateCoupon);

// ── Products ──────────────────────────────────────────────────────
// Specific paths declared before `/products/:id` so the param route doesn't shadow them.
router.get('/products/categories', productCtrl.getCategories);
router.get('/products/categories/search', productCtrl.searchCategories);
router.get('/products', productCtrl.getProducts);
router.post('/products/search', productCtrl.search);
router.get('/products/category/:id', productCtrl.categoriesProduct);
router.get('/products/sub-category/:id', productCtrl.subCategoriesProduct);
router.get('/products/sub-sub-category/:id', productCtrl.subSubCategoriesProduct);
router.get('/products/similar', productCtrl.similarProducts);
router.get('/products/:id', auth.optional(), productCtrl.getProductDetails);
router.get('/products/:id/reviews', auth.optional(), reviewCtrl.getProductReviews);
router.get('/products/:id/my-review', auth.required(), reviewCtrl.getMyProductReview);
router.post('/products/:id/reviews', auth.required(), reviewUpload.single('image'), reviewCtrl.submitProductReview);

// ── Shipping ──────────────────────────────────────────────────────
router.get('/shipping/countries', shippingCtrl.getCountries);
router.get('/shipping/countries/:code/cities', shippingCtrl.getCountryCities);
router.get('/shipping/cost', shippingCtrl.getCost);

// ── Wishlist ──────────────────────────────────────────────────────
router.get('/wishlist', auth.required(), wishlistCtrl.getWishlist);
router.post('/wishlist', auth.required(), wishlistCtrl.addToWishlist);
router.delete('/wishlist', auth.required(), wishlistCtrl.removeFromWishlist);

module.exports = router;
