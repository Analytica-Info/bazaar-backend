const express = require('express');
const router = express.Router();
const productController = require('../../controllers/mobile/productController');
const smartCategoriesController = require('../../controllers/mobile/smartCategoriesController');
const authMiddleware = require('../../middleware/authMiddleware');
const createUpload = require("../../utilities/fileUpload");
const allowedFileTypes = /jpeg|jpg|png|pdf/;
const upload = createUpload(allowedFileTypes, "uploads/users");
const categories = createUpload(allowedFileTypes, "uploads/categories");

router.get('/categories', productController.getCategories);
router.post('/search-categories', productController.getSearchCategories);
router.get('/products', productController.products);
router.get('/product-details/:id', productController.productsDetails);
router.post('/search-product', productController.searchProduct);
router.post('/search', productController.search);
router.get('/categories-product/:id',  productController.categoriesProduct);
router.get('/sub-categories-product/:id',  productController.subCategoriesProduct);
router.get('/sub-sub-categories-product/:id',  productController.subSubCategoriesProduct);
router.get('/similar-products', productController.similarProducts);
router.post('/add-review', authMiddleware, upload.single('file'), productController.addReview);
router.post('/category-image', categories.single('file'), productController.categoryImages);
router.get('/review/:id', authMiddleware, productController.review);
router.get('/user-review/:id', authMiddleware, productController.UserReview);

router.get("/hot-offers", smartCategoriesController.hotOffers);
router.get("/products-price", smartCategoriesController.productsByPrice);
router.get("/top-rated-items", smartCategoriesController.getTopRatedProducts);
router.get("/trending-products", smartCategoriesController.trendingProducts);
router.get("/today-deal", smartCategoriesController.todayDeal);
router.get("/get-new-arrivals", smartCategoriesController.getNewArrivals);
router.get("/flash-sales", smartCategoriesController.getFlashSales);
router.get("/favourites-of-week", smartCategoriesController.favouritesOfWeek);
router.post("/store-flash-sales", smartCategoriesController.storeFlashSales);
router.get("/products-by-variant", smartCategoriesController.getProductByVariant);
router.get("/super-saver-products", smartCategoriesController.getSuperSaverProducts);

module.exports = router;