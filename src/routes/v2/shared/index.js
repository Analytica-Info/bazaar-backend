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

// ── Wishlist ──────────────────────────────────────────────────────
router.get('/wishlist', auth.required(), wishlistCtrl.getWishlist);
router.post('/wishlist', auth.required(), wishlistCtrl.addToWishlist);
router.delete('/wishlist', auth.required(), wishlistCtrl.removeFromWishlist);

module.exports = router;
