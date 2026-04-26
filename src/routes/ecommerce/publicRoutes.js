const express = require("express");
const {
  createCardCheckout,
  verifyCardPayment,
  checkout,
  addReview,
  review,
  coupons,
  checkCouponCode,
  redeemCoupon,
  fetchAllProducts,
  fetchHomeProducts,
  searchProduct,
  contactUs,
  newsLetter,
  productDetails,
  randomProducts,
  similarProducts,
  createCoupon,
  allCategories,
  categoriesProduct,
  subCategoriesProduct,
  subSubCategoriesProduct,
  getIdss,
  updateProductDetails,
  products,
  productsDetails,
  categories,
  getCategories,
  getIdsss,
  downloadFile,
  search,
  createTabbyCheckout,
  createNomodCheckout,
  verifyNomodPayment,
  searchSingleProduct,
  fetchDbProducts,
  fetchProductsNoImages,
  CouponCms,
  getCouponCms,
  getAllNewsLetters,
  editorBodyImagesUpload,
  deleteFileByUrl,
  sendBulkEmails,
  headerInfoCms,
  sliderCms,
  featuresCms,
  offersCms,
  categoryImagesCms,
  offerFilterCms,
  FooterInfoCms,
  AboutCms,
  ShopCms,
  contactCms,
  BrandsLogo,
  getCmsData,
  updateCouponCount,
  getCouponCount,
  getCronLogs,
  getCategoryNameById,
  brands,
  getBrandNameById,
  verifyTabbyPayment,
} = require("../../controllers/ecommerce/publicController");
const {
  hotOffers,
  productsByPrice,
  getTopRatedProducts,
  trendingProducts,
  todayDeal,
  getNewArrivals,
  getFlashSales,
  favouritesOfWeek,
  storeFlashSales,
  toggleFlashSaleStatus,
  getFlashSaleData,
  getSuperSaverProducts,
  exportProductsAvailability,
} = require("../../controllers/ecommerce/smartCategoriesController");
const { deleteAccountPublic } = require("../../controllers/ecommerce/userController");
const { exportProductsToGoogleSheet } = require("../../scripts/googleSheetExporter");
const adminMiddleware = require("../../middleware/adminMiddleware");
const authMiddleware = require("../../middleware/authMiddleware");
const upload = require("../../config/multerConfig");
const shippingCtrl = require("../../controllers/ecommerce/shippingCountryController");

const router = express.Router();

// Public shipping endpoints
router.get("/shipping-countries", shippingCtrl.listActive);
router.get("/shipping-countries/:code/cities", shippingCtrl.getCities);
router.get("/shipping-cost", shippingCtrl.getShippingCost);

router.post("/create-card-checkout", createCardCheckout);
router.post("/create-tabby-checkout", createTabbyCheckout);
router.post("/create-nomod-checkout", createNomodCheckout);
router.post("/verify-nomod-payment", authMiddleware("user"), verifyNomodPayment);
router.post("/checkout", checkout);
router.post("/verify-card-payment", authMiddleware("user"), verifyCardPayment);
router.post(
  "/verify-tabby-payment",
  authMiddleware("user"),
  verifyTabbyPayment
);
router.post("/add-review", authMiddleware("user"), addReview);
router.get("/review", review);
router.get("/coupon", coupons);
router.post("/check-coupon", authMiddleware("user"), checkCouponCode);
router.post("/redeem-coupon", redeemCoupon);
// router.get('/fetch_all_products',  fetchAllProducts);
router.get("/fetch_home_products", fetchHomeProducts);
router.post("/search", search);

router.post("/search-product", searchProduct);
router.post("/search-single-product", searchSingleProduct);
router.post("/contact-us", contactUs);
router.post("/news-letter", newsLetter);

router.get("/get-newsletter-subscribers", adminMiddleware, getAllNewsLetters);
router.post("/send-bulk-mails", adminMiddleware, sendBulkEmails);

// router.get('/product-details/:id', productDetails);
router.get("/random-products/:id", randomProducts);
router.get("/similar-products/:id", similarProducts);

router.post("/create-coupon", authMiddleware("user"), createCoupon);

// router.get('/all-categories', allCategories);
router.get("/categories-product/:id", categoriesProduct);
router.get("/sub-categories-product/:id", subCategoriesProduct);
router.get("/sub-sub-categories-product/:id", subSubCategoriesProduct);

router.get("/all-categories", getCategories);
router.get("/fetch_all_products", products);
router.get("/product-details/:id", productsDetails);

router.get("/categories", categories);
router.get("/brands", brands);

router.get("/brand-name/:id", getBrandNameById);
router.get("/category-name/:id", getCategoryNameById);

router.get("/store-all-items", getIdss);
router.get("/store-all-item", getIdsss);
router.get("/update-product-details/:id", updateProductDetails);
router.get("/download-file", downloadFile);

router.get("/fetch-db-products", fetchDbProducts);
router.get("/fetch-products-no-images", fetchProductsNoImages);

router.post("/body-images-upload", editorBodyImagesUpload);
router.post("/delete-body-images-upload", deleteFileByUrl);

//  CMS Routes (GET is public for reading, POST requires admin for writing)

router.get("/get-cms-data", getCmsData);
router.post("/coupon-cms", adminMiddleware, CouponCms);
router.get("/get-coupon-cms-data", getCouponCms);
router.post("/header-info-cms", adminMiddleware, headerInfoCms);
router.post("/slider-cms", adminMiddleware, sliderCms);
router.post("/features-cms", adminMiddleware, featuresCms);
router.post("/offers-cms", adminMiddleware, offersCms);
router.post("/categoriesImages-cms", adminMiddleware, categoryImagesCms);
router.post("/offerFilter-cms", adminMiddleware, offerFilterCms);
router.post("/footerInfo-cms", adminMiddleware, FooterInfoCms);
router.post("/about-cms", adminMiddleware, AboutCms);
router.post("/shop-cms", adminMiddleware, ShopCms);
router.post("/contact-cms", adminMiddleware, contactCms);
router.post("/brandsLogo-cms", adminMiddleware, BrandsLogo);

router.post("/update-coupon-count", updateCouponCount);
router.get("/get-coupon-count", getCouponCount);

router.get("/get-cron-logs", adminMiddleware, getCronLogs);

router.post("/export-products-to-sheet", async (req, res) => {
  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const result = await exportProductsToGoogleSheet(spreadsheetId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/hot-offers", hotOffers);
router.get("/products-price", productsByPrice);
router.get("/top-rated-items", getTopRatedProducts);
router.get("/trending-products", trendingProducts);
router.get("/today-deal", todayDeal);
router.get("/get-new-arrivals", getNewArrivals);
router.get("/flash-sales", getFlashSales);
router.get("/flash-sale-data", getFlashSaleData);
router.get("/favourites-of-week", favouritesOfWeek);
router.post("/store-flash-sales", storeFlashSales);
router.post("/toggle-flash-sale-status", toggleFlashSaleStatus);
router.get("/super-saver-products", getSuperSaverProducts);
router.get("/export-products-availability", exportProductsAvailability);
router.post("/delete-account-public", deleteAccountPublic);

module.exports = router;
