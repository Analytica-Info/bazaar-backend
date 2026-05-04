const express = require("express");
const connectDB = require("../../config/db");
const Order = require('../../repositories').orders.rawModel();
const OrderDetail = require('../../repositories').orderDetails.rawModel();
const Review = require('../../repositories').reviews.rawModel();
const Coupon = require('../../repositories').coupons.rawModel();
const BankPromoCode = require('../../repositories').bankPromoCodes.rawModel();
const BankPromoCodeUsage = require('../../repositories').bankPromoCodeUsages.rawModel();
const Notification = require('../../repositories').notifications.rawModel();
const Cart = require('../../repositories').carts.rawModel();
const NewsLetter = require('../../repositories').newsletters.rawModel();
const { getAdminEmail, getCcEmails } = require("../../utilities/emailHelper");

const Product = require('../../repositories').products.rawModel();
const ProductId = require('../../repositories').productIds.rawModel();
const { escapeRegex } = require("../../utilities/stringUtils");
const ProductView = require('../../repositories').productViews.rawModel();
const User = require('../../repositories').users.rawModel();
const Cronjoblog = require('../../repositories').cronJoblogs.rawModel();
const CouponsCount = require('../../repositories').couponsCount.rawModel();
const mime = require("mime-types");
const Brand = require('../../repositories').brands.rawModel();
const Category = require('../../repositories').categories.rawModel();
const stripe = require("stripe")(process.env.STRIPE_SK);
const cors = require("cors");
const axios = require("axios");
const compression = require("compression");
require("dotenv").config();
const { sendEmail } = require("../../mail/emailService");
const crypto = require("crypto");
const year = new Date().getFullYear();
const cache = require('../../utilities/cache');
const runtimeConfig = require('../../config/runtime');
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const Typo = require("typo-js");
const dictionary = new Typo("en_US");
const pako = require("pako");
const CartData = require('../../repositories').cartData.rawModel();
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fastCsv = require("fast-csv");
const multer = require("multer");
const nodemailer = require("nodemailer");
const async = require("async");
const ftpConfig = require("../../config/ftpConfig");
const createUploader = require("../../config/multerConfig");
const deleteOldFile = require("../../utils/deleteOldFile");
const { logActivity } = require("../../utilities/activityLogger");
const { logBackendActivity } = require("../../utilities/backendLogger");
const PendingPayment = require('../../repositories').pendingPayments.rawModel();

// ─── Phase 4 Service Imports ─────────────────────────────────────
const productService = require("../../services/productService");

// Bandwidth optimization: list-endpoint projections.
// LIST_EXCLUDE_SELECT is the canonical slim projection (strips variants,
// description, attributes, etc.). Use this when the response only ships
// product cards.
// LIST_EXCLUDE_SELECT_KEEP_DESCRIPTION keeps product.description for endpoints
// that legitimately return description text (e.g. search results).
// See src/services/productService.js for the canonical definition.
const LIST_EXCLUDE_SELECT = [
  "product.variants",
  "product.product_codes",
  "product.suppliers",
  "product.composite_bom",
  "product.tag_ids",
  "product.attributes",
  "product.account_code_sales",
  "product.account_code_purchase",
  "product.price_outlet",
  "product.brand_id",
  "product.deleted_at",
  "product.version",
  "product.created_at",
  "product.updated_at",
  "webhook",
  "webhookTime",
  "__v",
  "updatedAt",
  "product.description",
]
  .map((f) => `-${f}`)
  .join(" ");

// Same as LIST_EXCLUDE_SELECT but keeps product.description (needed by endpoints
// that surface description text in their response).
const LIST_EXCLUDE_SELECT_KEEP_DESCRIPTION = [
  "product.variants",
  "product.product_codes",
  "product.suppliers",
  "product.composite_bom",
  "product.tag_ids",
  "product.attributes",
  "product.account_code_sales",
  "product.account_code_purchase",
  "product.price_outlet",
  "product.brand_id",
  "product.deleted_at",
  "product.version",
  "product.created_at",
  "product.updated_at",
  "webhook",
  "webhookTime",
  "__v",
  "updatedAt",
]
  .map((f) => `-${f}`)
  .join(" ");
const cmsService = require("../../services/cmsService");
const couponService = require("../../services/couponService");
const checkoutService = require("../../services/checkoutService");
const newsletterService = require("../../services/newsletterService");

const logger = require("../../utilities/logger");
// ─── Multer Uploaders (kept here — routes reference these arrays) ─
const upload = multer({ dest: "temp/" });

const headerInfoUpload = createUploader("cms/HeaderInfo");
const couponFormUpload = createUploader("cms/CouponForm");
const sliderImagesUpload = createUploader("cms/SliderImages");
const offersUpload = createUploader("cms/Offers");
const categoryImagesUpload = createUploader("cms/CategoryImages");
const offerFilterUpload = createUploader("cms/OfferFilter");
const footerInfoUpload = createUploader("cms/FooterInfo");
const aboutUpload = createUploader("cms/About");
const shopUpload = createUploader("cms/Shop");
const brandsLogoUpload = createUploader("cms/BrandsLogo");

const editorBodyImagesUpload = createUploader("EditorBodyImages");

const uploadContactUsFile = createUploader("contactUs");

// ─── Environment Variables ────────────────────────────────────────
const API_KEY = process.env.API_KEY;
const CATEGORIES_URL = process.env.CATEGORIES_URL;
const BRANDS_URL = process.env.BRANDS_URL;
const PRODUCT_TYPE = process.env.PRODUCT_TYPE;
const PRODUCTS_URL = process.env.PRODUCTS_URL;
const PRODUCTS_UPDATE = process.env.PRODUCTS_UPDATE;
const ENVIRONMENT = process.env.ENVIRONMENT;
const BACKEND_URL = process.env.BACKEND_URL;
const TABBY_SECRET_KEY = process.env.TABBY_SECRET_KEY;
const TABBY_WEBHOOK_SECRET = process.env.TABBY_WEBHOOK_SECRET;
const WEBURL = process.env.URL;

// ─── Thin wrapper helper ─────────────────────────────────────────
function handleServiceError(res, error) {
  const status = error.status || 500;
  const body = {};
  if (error.message) body.message = error.message;
  if (error.error) body.error = error.error;
  return res.status(status).json(body);
}

// ══════════════════════════════════════════════════════════════════
//  INLINE UTILITY FUNCTIONS (kept — no service for these)
// ══════════════════════════════════════════════════════════════════

exports.getCronLogs = async (req, res) => {
  try {
    const logs = await Cronjoblog.find({});
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: "Error fetching logs", error });
  }
};

// ══════════════════════════════════════════════════════════════════
//  COUPON SERVICE WRAPPERS
// ══════════════════════════════════════════════════════════════════

exports.getCouponCount = async (req, res) => {
  try {
    const result = await couponService.getCouponCount();
    res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.updateCouponCount = async (req, res) => {
  try {
    const result = await couponService.updateCouponCount(req.body.count);
    res.json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.coupons = async (req, res) => {
  try {
    const result = await couponService.getCoupons();
    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.checkCouponCode = async (req, res) => {
  try {
    const { couponCode } = req.body;
    const userId = req.user?._id || null;
    const result = await couponService.checkCouponCode(couponCode, userId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.redeemCoupon = async (req, res) => {
  try {
    const { couponCode, mobileNumber } = req.body;
    const userId = req.user?._id || null;
    const result = await couponService.redeemCoupon(userId, couponCode, mobileNumber);
    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const user_id = req.user._id;
    const result = await couponService.createCoupon(user_id, req.body);
    return res.status(201).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

// ══════════════════════════════════════════════════════════════════
//  CMS SERVICE WRAPPERS
// ══════════════════════════════════════════════════════════════════

exports.getCouponCms = async (req, res) => {
  try {
    const result = await cmsService.getCouponCms();
    res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.getCmsData = async (req, res) => {
  try {
    const result = await cmsService.getCmsData();
    res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.CouponCms = [
  couponFormUpload.fields([
    { name: "logo", maxCount: 1 },
    { name: "mrBazaarLogo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = {
        logo: req.files["logo"] ? req.files["logo"][0] : null,
        mrBazaarLogo: req.files["mrBazaarLogo"] ? req.files["mrBazaarLogo"][0] : null,
      };
      const result = await cmsService.updateCouponCms(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.headerInfoCms = [
  headerInfoUpload.fields([{ name: "logo", maxCount: 1 }]),
  async (req, res) => {
    try {
      const files = {
        logo: req.files["logo"] ? req.files["logo"][0] : null,
      };
      const result = await cmsService.updateHeader(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.sliderCms = [
  sliderImagesUpload.fields([
    { name: "sliderImage1", maxCount: 1 },
    { name: "sliderImage2", maxCount: 1 },
    { name: "sliderImage3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = {
        sliderImage1: req.files["sliderImage1"] ? req.files["sliderImage1"][0] : null,
        sliderImage2: req.files["sliderImage2"] ? req.files["sliderImage2"][0] : null,
        sliderImage3: req.files["sliderImage3"] ? req.files["sliderImage3"][0] : null,
      };
      const result = await cmsService.updateSlider(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.featuresCms = async (req, res) => {
  try {
    const result = await cmsService.updateFeatures(req.body);
    res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.offersCms = [
  offersUpload.array("offerImage", 3),
  async (req, res) => {
    try {
      const files = { offerImages: req.files || [] };
      const result = await cmsService.updateOffers(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.categoryImagesCms = [
  categoryImagesUpload.fields([
    { name: "Electronics", maxCount: 1 },
    { name: "Home", maxCount: 1 },
    { name: "Sports", maxCount: 1 },
    { name: "Toys", maxCount: 1 },
    { name: "Home_Improvement", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = {};
      const categories = ["Electronics", "Home", "Sports", "Toys", "Home_Improvement"];
      for (const category of categories) {
        files[category] = req.files[category] ? req.files[category][0] : null;
      }
      const result = await cmsService.updateCategoryImages(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.offerFilterCms = [
  offerFilterUpload.fields([
    { name: "Image1", maxCount: 1 },
    { name: "Image2", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = {
        Image1: req.files["Image1"]?.[0] || null,
        Image2: req.files["Image2"]?.[0] || null,
      };
      const result = await cmsService.updateOfferFilter(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.FooterInfoCms = [
  footerInfoUpload.fields([{ name: "logo", maxCount: 1 }]),
  async (req, res) => {
    try {
      const files = {
        logo: req.files["logo"] ? req.files["logo"][0] : null,
      };
      const result = await cmsService.updateFooter(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.AboutCms = [
  aboutUpload.fields([{ name: "backgroundImage", maxCount: 1 }]),
  async (req, res) => {
    try {
      const files = {
        backgroundImage: req.files["backgroundImage"] ? req.files["backgroundImage"][0] : null,
      };
      const result = await cmsService.updateAbout(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.ShopCms = [
  shopUpload.fields([
    { name: "Image1", maxCount: 1 },
    { name: "Image2", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = {
        Image1: req.files["Image1"] ? req.files["Image1"][0] : null,
        Image2: req.files["Image2"] ? req.files["Image2"][0] : null,
      };
      const result = await cmsService.updateShop(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.contactCms = async (req, res) => {
  try {
    const result = await cmsService.updateContact(req.body);
    res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.BrandsLogo = [
  brandsLogoUpload.fields(
    Array.from({ length: 20 }, (_, idx) => ({
      name: `logo${idx}`,
      maxCount: 1,
    }))
  ),
  async (req, res) => {
    try {
      const files = {};
      for (let i = 0; i < 20; i++) {
        const fileArray = req.files[`logo${i}`];
        if (fileArray && fileArray.length > 0) {
          files[`logo${i}`] = fileArray[0];
        }
      }
      const result = await cmsService.updateBrandsLogo(req.body, files);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.editorBodyImagesUpload = [
  editorBodyImagesUpload.fields([{ name: "file", maxCount: 1 }]),
  async (req, res) => {
    try {
      const file = req.files?.file?.[0];
      const result = await cmsService.uploadEditorImage(file?.filename || null);
      res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error);
    }
  },
];

exports.deleteFileByUrl = async (req, res) => {
  try {
    const result = await cmsService.deleteEditorImage(req.body.imageUrl);
    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

// ══════════════════════════════════════════════════════════════════
//  PRODUCT SERVICE WRAPPERS
// ══════════════════════════════════════════════════════════════════

exports.search = async (req, res) => {
  try {
    const { search } = req.body;
    if (!search) {
      return res.status(400).json({ error: "Search term is required" });
    }
    const safeSearch = escapeRegex(search);

    let products = await Product.find({
      $or: [
        { "product.name": { $regex: safeSearch, $options: "i" } },
        { "product.description": { $regex: safeSearch, $options: "i" } },
      ],
    })
      .select(LIST_EXCLUDE_SELECT_KEEP_DESCRIPTION)
      .lean();
    products = products.filter((product) => product.status === true);

    const filteredProducts = products.filter((product) => {
      return (
        product.variantsData &&
        product.variantsData.length > 0 &&
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
      );
    });

    const result = filteredProducts
      .filter((product) => product.totalQty > 0)
      .map((product) => ({
        id: product.product.id,
        name: product.product.name,
        description: product.product.description,
        product_type_id: product.product.product_type_id,
      }));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'public handler error:');
    res.status(500).json({ error: error.message });
  }
};

exports.fetchAllProducts = async (req, res) => {
  try {
    const result = await productService.getAllProducts();
    return res.json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.fetchHomeProducts = async (req, res) => {
  try {
    const result = await productService.getHomeProducts();
    res.json({ result });
  } catch (error) {
    logger.error({ err: error }, "Error fetching products:");
    res.status(500).json({ error: "Failed to fetch home products" });
  }
};

exports.searchSingleProduct = async (req, res) => {
  try {
    const { item_name } = req.body;
    const result = await productService.searchSingleProduct(item_name);
    res.json(result);
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
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error({ err: error }, "Error processing search request:");
    res.status(500).json({
      error: "An error occurred while processing the request",
    });
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

exports.getCategories = async (req, res) => {
  try {
    const result = await productService.getCategories();
    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.productsDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const userId = req.user?._id || null;
    const result = await productService.getProductDetails(id, userId);
    return res.json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.getCategoryNameById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await productService.getCategoryNameById(id);
    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.getBrandNameById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await productService.getBrandNameById(id);
    res.json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.brands = async (req, res) => {
  try {
    const result = await productService.getBrands();
    res.json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.allCategories = async (req, res) => {
  try {
    const result = await productService.getAllCategories();
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    res.status(500).json({ error: "Failed to fetch categories or products" });
  }
};

exports.categoriesProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await productService.getCategoriesProduct(id, req.query);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    res.status(500).json({ error: "Failed to fetch categories or products" });
  }
};

exports.subCategoriesProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await productService.getSubCategoriesProduct(id, req.query);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    res.status(500).json({ error: "Failed to fetch categories or products" });
  }
};

exports.subSubCategoriesProduct = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await productService.getSubSubCategoriesProduct(id, req.query);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    res.status(500).json({ error: "Failed to fetch categories or products" });
  }
};

exports.randomProducts = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await productService.getRandomProducts(id);
    return res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching product details:");
    return res.status(500).json({ error: "Failed to fetch product details" });
  }
};

exports.similarProducts = async (req, res) => {
  const { id } = req.params;
  const productId = req.headers["product-id"] || req.headers.productid;
  try {
    const result = await productService.getSimilarProducts(id, productId);
    return res.json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.fetchDbProducts = async (req, res) => {
  try {
    const result = await productService.fetchDbProducts(req.query);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching products:");
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

exports.fetchProductsNoImages = async (req, res) => {
  try {
    const result = await productService.fetchProductsNoImages(req.query);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching products with no images:");
    res.status(500).json({ error: "Failed to fetch products with no images" });
  }
};

// ══════════════════════════════════════════════════════════════════
//  CHECKOUT SERVICE WRAPPERS
// ══════════════════════════════════════════════════════════════════

exports.createCardCheckout = async (req, res) => {
  try {
    const user_id = req.user?._id;
    const result = await checkoutService.createStripeCheckout(
      req.body.cartData,
      user_id,
      req.body
    );
    res.status(200).json(result);
  } catch (error) {
    logger.error({ err: error }, "Error creating checkout session:");
    res.status(500).send("Internal Server Error");
  }
};

exports.createTabbyCheckout = async (req, res) => {
  try {
    const user_id = req.user?._id;
    const result = await checkoutService.createTabbyCheckout(
      req.body.orderData?.cartData || req.body.cartData,
      user_id,
      req.body
    );
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        ...(error.error ? { error: error.error } : {}),
        ...(error.data ? error.data : {}),
      });
    }
    logger.error({ err: error }, "Tabby checkout error:");
    const user = req.user || {};
    await logActivity({
      platform: 'Website Backend',
      log_type: 'backend_activity',
      action: 'Tabby Checkout Creation',
      status: 'failure',
      message: `Failed to create Tabby checkout: ${error.message}`,
      user: user,
      details: {
        error_details: error.message,
        stack: error.stack
      }
    });
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.verifyCardPayment = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const user_id = req.user?._id;
    const result = await checkoutService.verifyStripePayment(sessionId, user_id);
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    logger.error({ err: error }, "Error verifying card payment:");
    return res.status(500).json({ message: error.message });
  }
};

exports.verifyTabbyPayment = async (req, res) => {
  try {
    const { paymentId, bankPromoId } = req.body;
    // BUG-004 fix: optional chaining — verify can be hit without a session;
    // the service resolves the user from the payment record when needed.
    const user_id = req.user?._id;
    const result = await checkoutService.verifyTabbyPayment(paymentId, user_id, bankPromoId);
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error({ err: error }, "Tabby Payment error:");
    const user = req.user || {};
    await logActivity({
      platform: 'Website Backend',
      log_type: 'backend_activity',
      action: 'Payment Verification',
      status: 'failure',
      message: `Tabby payment verification failed: ${error.message}`,
      user: user,
      details: {
        payment_id: req.body.paymentId,
        error_details: error.message,
        stack: error.stack
      }
    });
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.createNomodCheckout = async (req, res) => {
  try {
    const result = await checkoutService.createNomodCheckout(req);
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    logger.error({ err: error }, 'Nomod checkout error:');
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.verifyNomodPayment = async (req, res) => {
  try {
    const result = await checkoutService.verifyNomodPayment(req);
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error({ err: error }, 'Nomod payment verification error:');
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.checkout = async (req, res) => {
  try {
    const user_id = req.user?._id;
    const result = await checkoutService.processCheckout(req.body, user_id);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'public handler error:');
    res.status(500).json({ error: error.message });
  }
};

exports.tabbyWebhook = async (req, res) => {
  try {
    // BUG-003 fix: webhook is mounted without auth middleware (server.js:144).
    // req.user is undefined when Tabby calls the endpoint. Optional chain so
    // we don't crash; downstream service resolves the user from the payment
    // record (paymentId carries the user reference).
    const user_id = req.user?._id;
    const forwardedIps = (req.headers["x-forwarded-for"] || "").split(",");
    const clientIP = forwardedIps[0]?.trim() || req.socket.remoteAddress;
    const secret = req.headers["x-webhook-secret"];

    const result = await checkoutService.handleTabbyWebhook(
      req.body,
      user_id,
      clientIP,
      secret
    );

    if (typeof result === "string") {
      return res.status(200).send(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).send(error.message);
    }
    logger.error({ err: error }, "Tabby webhook error:");
    return res.status(500).send("Internal server error");
  }
};

// ══════════════════════════════════════════════════════════════════
//  NEWSLETTER SERVICE WRAPPERS
// ══════════════════════════════════════════════════════════════════

exports.newsLetter = async (req, res) => {
  try {
    const { email, recaptchaToken } = req.body;
    const result = await newsletterService.subscribe(email, recaptchaToken);
    res.status(201).json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.getAllNewsLetters = async (req, res) => {
  try {
    const result = await newsletterService.getSubscribers();
    res.json(result);
  } catch (error) {
    return handleServiceError(res, error);
  }
};

exports.sendBulkEmails = function (req, res) {
  const emailData = req.body;
  const { to, cc, bcc, subject, body } = emailData;

  newsletterService
    .sendBulkEmails({
      emails: to,
      subject,
      htmlContent: body,
      cc,
      bcc,
    })
    .then((result) => {
      res.status(200).json(result);
    })
    .catch((error) => {
      const status = error.status || 500;
      res.status(status).json({ error: error.message || "Failed to send emails" });
    });
};

// ══════════════════════════════════════════════════════════════════
//  REVIEW (inline — small, no dedicated service)
// ══════════════════════════════════════════════════════════════════

exports.addReview = async (req, res) => {
  try {
    const {
      nickname,
      summary,
      texttext,
      product_id,
      quality_rating,
      value_rating,
      price_rating,
    } = req.body;
    const user_id = req.user._id;

    const order = await Review.create({
      userId: user_id,
      nickname,
      summary,
      texttext,
      product_id,
      quality_rating,
      value_rating,
      price_rating,
    });

    // Project only the fields the client needs — avoids fetching entire collection.
    const reviews = await Review.find()
      .select("nickname summary texttext image product_id quality_rating value_rating price_rating user_id userId createdAt updatedAt")
      .lean();

    res.json({
      message: "Review created successfully",
      reviews: reviews,
    });
  } catch (error) {
    logger.error({ err: error }, 'public handler error:');
    res.status(500).json({ error: error.message });
  }
};

exports.review = async (req, res) => {
  try {
    // Project only product.id from the populated Product — avoids fetching full documents.
    const reviews = await Review.find()
      .select("nickname summary texttext image product_id quality_rating value_rating price_rating user_id userId createdAt updatedAt")
      .populate("product_id", "product.id");

    const reviewsWithProductId = reviews.map(review => {
      const reviewObj = review.toObject();

      if (reviewObj.product_id && reviewObj.product_id.product && reviewObj.product_id.product.id) {
        reviewObj.productId = reviewObj.product_id.product.id;
      }

      if (reviewObj.product_id && reviewObj.product_id._id) {
        reviewObj.product_id = reviewObj.product_id._id;
      }

      return reviewObj;
    });

    res.json({
      reviews: reviewsWithProductId,
    });
  } catch (error) {
    logger.error({ err: error }, 'public handler error:');
    res.status(500).json({ error: error.message });
  }
};

// ══════════════════════════════════════════════════════════════════
//  CONTACT US (inline — uses reCAPTCHA + email, no service)
// ══════════════════════════════════════════════════════════════════

exports.contactUs = [
  uploadContactUsFile.single("file"),
  async (req, res) => {
    try {
      const { email, name, message, phone, recaptchaToken } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }
      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }
      if (!phone) {
        return res.status(400).json({ message: "Phone Number is required" });
      }
      if (!recaptchaToken) {
        return res
          .status(400)
          .json({ message: "reCAPTCHA verification is required" });
      }

      const RECAPTCHA_API_KEY = process.env.RECAPTCHA_API_KEY;
      const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

      if (!RECAPTCHA_API_KEY || !PROJECT_ID) {
        logger.error("reCAPTCHA Enterprise credentials are not configured");
        return res.status(500).json({ message: "Server configuration error" });
      }

      const recaptchaResponse = await axios.post(
        `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${RECAPTCHA_API_KEY}`,
        {
          event: {
            token: recaptchaToken,
            expectedAction: "contact_form",
            siteKey: process.env.RECAPTCHA_SITE_KEY,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const tokenValid = recaptchaResponse.data.tokenProperties?.valid;
      const action = recaptchaResponse.data.tokenProperties?.action;
      const score = recaptchaResponse.data.riskAnalysis?.score || 0;

      if (!tokenValid) {
        logger.error({ reason: recaptchaResponse.data.tokenProperties?.invalidReason }, 'reCAPTCHA token is invalid:');
        return res
          .status(403)
          .json({ message: "Security verification failed. Please try again." });
      }

      if (action !== "contact_form") {
        logger.error({ err: action }, "Invalid reCAPTCHA action:");
        return res.status(403).json({ message: "Invalid verification action" });
      }

      const MINIMUM_SCORE = 0.5;
      if (score < MINIMUM_SCORE) {
        console.warn(
          `Low reCAPTCHA score detected: ${score} (minimum: ${MINIMUM_SCORE})`
        );
        return res
          .status(403)
          .json({
            message: "Suspicious activity detected. Please try again later.",
          });
      }

      let fileUrl;

      if (req.file) {
        const fileName = req.file.filename;
        fileUrl = `${process.env.BACKEND_URL}/uploads/contactUs/${fileName}`;
      }

      const adminEmail = await getAdminEmail();

      const logoUrl = `${WEBURL}/images/logo.png`;

      const attachmentButtonHtml = fileUrl
        ? `<div style="margin-bottom:5px;">
       <a href="${BACKEND_URL}/download-file?url=${encodeURIComponent(fileUrl)}"
          style="background:#007BFF; text-decoration:none !important; font-weight:500; margin-bottom: 5px; color:#fff; text-transform:uppercase; font-size:14px; padding:10px 24px; display:inline-block; border-radius:3px;">
         Download Attachment
       </a>
     </div>`
        : "";

      const subject = `Thank You for Contacting Bazaar!`;
      const html = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8"
                        style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                    align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                                <tr>
                                                    <td style="padding:0 35px;">
                                                        <p>Thank you for reaching out to Bazaar! We have received your message and will get back to you shortly. Our team is here to help with any questions or concerns you may have.</p>
                                                        <p>If you have any additional information to share, feel free to reply to this email.</p>
                                                        <p>We look forward to connecting with you soon!</p>
                                                        <br>

                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="height:40px;">&nbsp;</td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>`;

      const adminSubject = "New Contact Us Submission - Bazaar";
      const adminHtml = `<body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
                                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                                        <tr>
                                            <td>
                                                <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0"
                                                    align="center" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="height:40px;">&nbsp;</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="text-align:center;">
                                                            <a href="https://bazaar-uae.com/" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                                            </a>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="height:20px;">&nbsp;</td>
                                                    </tr>
                                                    <tr>
                                                        <td>
                                                            <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                                style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                                <tr>
                                                                    <td style="height:40px;">&nbsp;</td>
                                                                </tr>
                                                                <tr>
                                                                    <td style="padding:0 35px;">
                                                                        <br>
                                                                        <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Dear Bazaar Team,</b></h6>
                                                                        <p style="color:#455056; font-size:16px; display: block; margin: 10px 4px 0px 0px; color:rgba(0,0,0,.64); font-weight: 500;">
                                                                            A new inquiry has been submitted via the Contact Us form on Bazaar.
                                                                        </p>
                                                                        <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Name <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${name}</p></p>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Phone <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${phone}</p></p>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Email <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${email}</p></p>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Message <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${message}</p></p>
                                                                        <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>

                                                                       ${attachmentButtonHtml}
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">Please follow up with the user as soon as possible. You can view more details in the admin dashboard.</p>
                                                                    </td>
                                                                </tr>
                                                                <tr>
                                                                    <td style="height:40px;">&nbsp;</td>
                                                                </tr>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="height:20px;">&nbsp;</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="text-align:center;">
                                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong>bazaar-uae.com</strong> </p>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td style="height:80px;">&nbsp;</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                </body>`;

      await sendEmail(email, subject, html);
      await sendEmail(adminEmail, adminSubject, adminHtml);

      res.status(200).json({
        message: `Thank you for reaching out Bazaar! We have received your message and will get back to you shortly.`,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  },
];

// ══════════════════════════════════════════════════════════════════
//  INLINE UTILITY EXPORTS (small functions, no service needed)
// ══════════════════════════════════════════════════════════════════

exports.downloadFile = async (req, res) => {
  const fileUrl = req.query.url;
  try {
    const response = await axios.get(fileUrl, { responseType: "stream" });
    const filename = path.basename(fileUrl);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.data.pipe(res);
  } catch (error) {
    logger.error({ err: error }, "Error downloading the file:");
    res.status(500).send("Failed to download the file.");
  }
};

exports.productDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const response = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );
    let product = response.data;
    if (product.error) {
      return res.status(404).json({ error: "Product not found." });
    }
    product = product.data;
    const productTypeId = product.product_type_id;
    const variantsData = [];

    let totalQty = 0;
    const variants = product.variants;
    if (variants.length === 0) {
      const inventoryResponse = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${id}/inventory`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );
      const inventory = inventoryResponse.data;
      let inventoryLevel = 0;
      if (inventory.data && inventory.data.length > 0) {
        const inventoryItem = inventory.data[0];
        inventoryLevel = inventoryItem.inventory_level || 0;
      }
      if (inventoryLevel !== 0) {
        variantsData.push({
          qty: inventoryLevel,
          id: product.id,
          sku: product.sku_number,
          name: product.name,
          price: product.price_standard.tax_inclusive,
        });
        totalQty += inventoryLevel;
      }
    } else {
      for (const variant of variants) {
        const variantId = variant.id;
        const variantSku = variant.primary_sku_code;
        const variantName = variant.name;
        const variantPrice = variant.price_standard.tax_inclusive;
        const variantDefinitions = variant.variant_definitions;
        let sku = "";
        if (variantDefinitions && variantDefinitions.length > 0) {
          const values = variantDefinitions.map((def) => def.value);
          sku = values.join(" - ");
        }
        const inventoryResponse = await axios.get(
          `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: "application/json",
            },
          }
        );
        const inventory = inventoryResponse.data;
        let inventoryLevel = 0;
        if (inventory.data && inventory.data.length > 0) {
          const inventoryItem = inventory.data[0];
          inventoryLevel = inventoryItem.inventory_level || 0;
        }
        if (inventoryLevel !== 0) {
          variantsData.push({
            qty: inventoryLevel,
            sku: sku,
            price: variantPrice,
            id: variantId,
            name: variantName,
          });
          totalQty += inventoryLevel;
        }
      }
    }
    return res.json({ product, variantsData, totalQty });
  } catch (error) {
    logger.error({ err: error }, "Error fetching product details:");
    return res.status(500).json({ error: "Failed to fetch product details" });
  }
};

exports.updateProductDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const { product, variantsData, totalQty } = await fetchProductDetails(id);

    const updatedEntry = await Product.findOneAndUpdate(
      { "product.id": product.id },
      {
        product,
        variantsData,
        totalQty,
      }
    );

    if (updatedEntry) {
      logger.info(`Updated details for product ID: ${product.id}`);
      return res.json({
        message: `Product details updated successfully.`,
        product: updatedEntry,
      });
    } else {
      logger.info(`Product ID: ${product.id} does not exist.`);
      return res
        .status(404)
        .json({ error: `Product not found in the database.` });
    }
  } catch (error) {
    logger.error({ err: error }, "Error updating product details:");
    return res.status(500).json({ error: "Failed to update product details." });
  }
};

function isClientConnected(res) {
  return !res.headersSent && res.socket && res.socket.writable;
}

exports.getIdss = async (req, res) => {
  let isProcessing = true;

  req.on("close", () => {
    isProcessing = false;
    logger.info("Client disconnected, stopping processing");
  });

  try {
    let products = await fetchProducts();
    if (!isProcessing) return;
    products = await filterProductsByInventory(products);
    if (!isProcessing) return;

    const productIds = products.map((product) => product.id);

    for (const id of productIds) {
      if (!isProcessing) return;
      const existingProduct = await ProductId.findOne({ productId: id });
      if (!existingProduct) {
        await ProductId.create({ productId: id });
      }
    }

    let productIdss = await ProductId.find({}, "productId");
    if (!isProcessing) return;
    productIdss = productIdss.map((item) => item.productId);
    if (productIdss.length > 0) {
      await storeProductDetails(productIdss, res, isProcessing);
    } else {
      if (isClientConnected(res)) {
        return res.status(404).json({
          message: "No product IDs found",
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Error fetching and storing product IDs:");
    if (isClientConnected(res)) {
      return res.status(500).json({
        message: "Failed to process product IDs",
        error: error.message,
      });
    }
  }
};

exports.getIdsss = async (req, res) => {
  try {
    let products = await fetchProducts();
    products = await filterProductsByInventory(products);

    const productIds = products.map((product) => product.id);

    let storedProductIds = await ProductId.find({}, "productId");
    storedProductIds = storedProductIds.map((item) => item.productId);

    const missingProductIds = productIds.filter(
      (id) => !storedProductIds.includes(id)
    );

    if (missingProductIds.length > 0) {
      console.log("Missing Product IDs:", missingProductIds);

      for (const id of missingProductIds) {
        await ProductId.create({ productId: id });
        logger.info(`Added new Product ID: ${id}`);
      }
      await storeProductDetails(missingProductIds, res);
    } else {
      logger.info("No missing product IDs found.");
      return res.status(200).json({
        message: "All product IDs are already in the database.",
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Error fetching and storing product IDs:");
    return res.status(500).json({
      message: "Failed to process product IDs",
      error: error.message,
    });
  }
};

exports.categories = async (req, res) => {
  try {
    const categories = await fetchCategories();
    // Push status filter to MongoDB — avoids loading inactive products into Node.js memory.
    const allProducts = await Product.find({ status: true })
      .select(LIST_EXCLUDE_SELECT)
      .lean();

    const productCountMap = {};
    allProducts.forEach((product) => {
      const productTypeId = product.product.product_type_id;
      if (!productCountMap[productTypeId]) {
        productCountMap[productTypeId] = 0;
      }
      if (product.totalQty > 0) {
        productCountMap[productTypeId]++;
      }
    });

    const categoryTree = {};
    const flatCategoryList = [];

    categories.forEach((category) => {
      const path = category.category_path;
      if (path && path.length > 0) {
        let currentLevel = categoryTree;
        const fullCategoryPath = [];

        path.forEach((categoryItem, index) => {
          const productTypeId = categoryItem.id;
          const qty = productCountMap[productTypeId] || 0;

          fullCategoryPath.push(categoryItem.name);

          if (!currentLevel[categoryItem.id]) {
            currentLevel[categoryItem.id] = {
              id: categoryItem.id,
              name: categoryItem.name,
              qty: 0,
              sub_categories: {},
            };
          }

          currentLevel[categoryItem.id].qty += qty;

          currentLevel = currentLevel[categoryItem.id].sub_categories;
        });

        flatCategoryList.push({
          id: category.id,
          name: fullCategoryPath.join(" / "),
          qty: productCountMap[category.id] || 0,
        });
      }
    });

    const aggregateSubCategoryQuantities = (category) => {
      let totalQty = category.qty;

      for (const subCategoryId in category.sub_categories) {
        const subCategory = category.sub_categories[subCategoryId];
        totalQty += aggregateSubCategoryQuantities(subCategory);
      }

      category.qty = totalQty;

      return totalQty;
    };

    Object.values(categoryTree).forEach((category) => {
      aggregateSubCategoryQuantities(category);
    });

    const convertToArray = (obj) => {
      return Object.values(obj).map((item) => ({
        ...item,
        sub_categories: convertToArray(item.sub_categories),
      }));
    };

    const finalCategoryTree = convertToArray(categoryTree);

    flatCategoryList.sort((a, b) => a.name.localeCompare(b.name));

    const categoryData = {
      side_bar_categories: finalCategoryTree,
      search_categoriesList: flatCategoryList,
    };

    const existingCategories = await Category.findOne({});
    if (existingCategories) {
      logger.info("Categories updated in database.");
    } else {
      const newCategory = new Category(categoryData);
      await newCategory.save();
      logger.info("Categories saved to database.");
    }

    logger.info("Return - API - All Categories");
    res.json({
      success: true,
      message: "Categories processed and saved to the database successfully.",
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching categories or products:");
    res
      .status(500)
      .json({ error: "Failed to fetch or save categories or products." });
  }
};

// ══════════════════════════════════════════════════════════════════
//  PRIVATE HELPER FUNCTIONS (unchanged — used by inline exports)
// ══════════════════════════════════════════════════════════════════

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

async function getDiagnosticInventory(lightspeedVariantId) {
  const diag = { lightspeedQty: null, localQty: null, lightspeedError: null, localError: null };
  try {
    const invRes = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${lightspeedVariantId}/inventory`,
      { headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" } }
    );
    diag.lightspeedQty = invRes.data?.data?.[0]?.inventory_level ?? null;
  } catch (e) {
    diag.lightspeedError = e?.message || String(e);
  }
  try {
    const doc = await Product.findOne({
      $or: [
        { "product.id": lightspeedVariantId },
        { "variantsData.id": lightspeedVariantId },
      ],
    }).lean();
    const v = doc?.variantsData?.find((vv) => String(vv.id) === String(lightspeedVariantId));
    diag.localQty = v != null ? v.qty : null;
    if (!doc) diag.localError = "Product not found in local DB";
    else if (v == null) diag.localError = `Variant ${lightspeedVariantId} not in variantsData`;
  } catch (e) {
    diag.localError = e?.message || String(e);
  }
  return diag;
}

async function updateQuantities(cartData, orderId = null) {
  try {
    const emailDetails = [];
    const updateResults = await Promise.all(
      cartData.map(async (item, index) => {
        const updateQty = item.total_qty - item.qty;
        const mongoId = item.id;
        const name = item.name;
        const lightspeedVariantId = item.variantId || item.product_id;

        const beforeDiag = await getDiagnosticInventory(lightspeedVariantId);

        let update = false;
        try {
          update = true;
        } catch (lsError) {
          const afterDiagOnThrow = await getDiagnosticInventory(lightspeedVariantId);
          const qtyMsgThrow = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER (unchanged): Lightspeed=${afterDiagOnThrow.lightspeedQty} Local=${afterDiagOnThrow.localQty} | Expected=${updateQty}. Lightspeed API THREW: ${lsError?.message}`;
          await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Inventory Update',
            status: 'failure',
            message: `Product ${name} - Lightspeed API threw. ${qtyMsgThrow}`,
            user: null,
            details: {
              order_id: orderId,
              product_id: lightspeedVariantId?.toString?.(),
              product_name: name,
              error_details: lsError?.message,
              response_data: lsError?.response?.data || null,
              qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
              qty_after: { lightspeed: afterDiagOnThrow.lightspeedQty, local: afterDiagOnThrow.localQty },
              expected_after: updateQty,
              qty_sold: item.qty,
            }
          });
          await logBackendActivity({
            platform: 'Website Backend',
            activity_name: 'Product Database Update',
            status: 'failure',
            message: `Product ${name} - Lightspeed API threw. ${qtyMsgThrow}`,
            product_id: lightspeedVariantId?.toString?.(),
            product_name: name,
            order_id: orderId,
            execution_path: 'publicController.updateQuantities -> Lightspeed API',
            error_details: qtyMsgThrow
          });
          throw lsError;
        }

        if (update) {
          const mongoObjectId = mongoId && typeof mongoId === 'string' ? mongoId : mongoId?.toString?.();
          let updatedEntry = null;
          try {
            const qtySold = item.qty || 0;
            const currentDoc = await Product.findById(mongoObjectId).lean();
            if (!currentDoc) {
              throw new Error(`Product not found for _id=${mongoObjectId}`);
            }
            const mainProductId = currentDoc.product?.id;
            let variantsData = [];
            if (mainProductId) {
              try {
                const fetched = await fetchProductDetails(mainProductId);
                variantsData = Array.isArray(fetched.variantsData) ? fetched.variantsData.map((v) => ({ ...v })) : [];
              } catch (fetchErr) {
                logger.error({ err: fetchErr }, `fetchProductDetails failed for ${mainProductId}:`);
                variantsData = Array.isArray(currentDoc.variantsData) ? currentDoc.variantsData.map((v) => ({ ...v })) : [];
                const vIdx = variantsData.findIndex((vv) => String(vv.id) === String(lightspeedVariantId));
                if (vIdx !== -1) {
                  variantsData[vIdx].qty = Math.max(0, (variantsData[vIdx].qty || 0) - qtySold);
                }
              }
            }
            const newTotalQty = variantsData.reduce((sum, v) => sum + (v.qty || 0), 0);
            updatedEntry = await Product.findByIdAndUpdate(
              mongoObjectId,
              { $set: { variantsData, totalQty: newTotalQty } },
              { new: true }
            );
            const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
            const qtyMsg = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER: Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty}`;
            await logActivity({
              platform: 'Website Backend',
              log_type: 'backend_activity',
              action: 'Inventory Update',
              status: 'success',
              message: `Product ${name} updated. ${qtyMsg}`,
              user: null,
              details: {
                order_id: orderId,
                product_id: lightspeedVariantId?.toString?.(),
                product_name: name,
                qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
                qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
                expected_after: updateQty,
                qty_sold: qtySold,
              }
            });
            await logBackendActivity({
              platform: 'Website Backend',
              activity_name: 'Product Database Update',
              status: 'success',
              message: `Product ${name} updated. ${qtyMsg}`,
              product_id: lightspeedVariantId?.toString?.(),
              product_name: name,
              order_id: orderId,
              execution_path: 'publicController.updateQuantities -> Product.findByIdAndUpdate'
            });
          } catch (dbError) {
            const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
            const qtyMsg = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER: Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty}. DB Update Error: ${dbError.message}`;
            await logActivity({
              platform: 'Website Backend',
              log_type: 'backend_activity',
              action: 'Inventory Update',
              status: 'failure',
              message: `Product ${name} - DB update failed. ${qtyMsg}`,
              user: null,
              details: {
                order_id: orderId,
                product_id: lightspeedVariantId?.toString?.(),
                product_name: name,
                error_details: dbError.message,
                qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
                qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
                expected_after: updateQty,
                qty_sold: item.qty,
              }
            });
            await logBackendActivity({
              platform: 'Website Backend',
              activity_name: 'Product Database Update',
              status: 'failure',
              message: `Product ${name} - DB update failed. ${qtyMsg}`,
              product_id: lightspeedVariantId?.toString?.(),
              product_name: name,
              order_id: orderId,
              execution_path: 'publicController.updateQuantities -> Product.findByIdAndUpdate',
              error_details: qtyMsg
            });
          }
        }

        return { productId: mongoId, updated: update };
      })
    );
    return updateResults;
  } catch (error) {
    logger.error({ err: error }, "Error in updateQuantities:");
    throw error;
  }
}

async function filterProductsByInventory(productsResponse) {
  const allProducts = productsResponse || [];

  const allInventories = [];
  let after = "";

  do {
    const inventoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/inventory?page_size=5000&after=${after}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const inventories = inventoryResponse.data;
    if (inventories.data && inventories.data.length > 0) {
      allInventories.push(...inventories.data);
    }

    after = inventories.version?.max || "";
  } while (after);

  // Build a lookup map from inventory — O(n) build, O(1) per lookup.
  // Previous nested loop was O(products × variants × inventories) ≈ 2.5B comparisons.
  const inventoryMap = new Map();
  for (const inv of allInventories) {
    const existing = inventoryMap.get(inv.product_id) || 0;
    inventoryMap.set(inv.product_id, existing + inv.inventory_level);
  }

  const filteredProducts = [];

  for (const product of allProducts) {
    let totalQty = 0;

    if (product.variants && product.variants.length > 0) {
      product.variants = product.variants.filter((variant) => {
        return (inventoryMap.get(variant.id) || 0) > 0;
      });

      product.variants.forEach((variant) => {
        totalQty += inventoryMap.get(variant.id) || 0;
      });
    } else {
      totalQty = inventoryMap.get(product.id) || 0;
    }

    if (totalQty > 0) {
      product.qty = totalQty;
      filteredProducts.push(product);
    }
  }

  return filteredProducts;
}

async function filterAndCacheProductsByInventory() {
  const cacheKey = cache.key('lightspeed', 'products-inventory', 'v1');
  return cache.getOrSet(cacheKey, runtimeConfig.cache.lsInventoryTtl, async () => {
    logger.info("Fetching filtered products from Lightspeed API");

    const productsResponse = await axios.get(PRODUCTS_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });
    const allProducts = (productsResponse.data.data || []).filter(
      (product) => product.is_active === true
    );

    const allInventories = [];
    let after = "";

    do {
      const inventoryResponse = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/inventory?page_size=5000&after=${after}`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );

      const inventories = inventoryResponse.data;
      if (inventories.data && inventories.data.length > 0) {
        allInventories.push(...inventories.data);
      }

      after = inventories.version?.max || "";
    } while (after);

    const filteredProducts = [];

    for (const product of allProducts) {
      let totalQty = 0;

      if (product.variants && product.variants.length > 0) {
        product.variants = product.variants.filter((variant) => {
          let variantQty = 0;
          for (const inventory of allInventories) {
            if (inventory.product_id === variant.id) {
              variantQty += inventory.inventory_level;
            }
          }
          return variantQty > 0;
        });

        product.variants.forEach((variant) => {
          let variantQty = 0;
          for (const inventory of allInventories) {
            if (inventory.product_id === variant.id) {
              variantQty += inventory.inventory_level;
            }
          }
          totalQty += variantQty;
        });
      } else {
        for (const inventory of allInventories) {
          if (inventory.product_id === product.id) {
            totalQty += inventory.inventory_level;
          }
        }
      }

      if (totalQty > 0) {
        product.qty = totalQty;
        filteredProducts.push(product);
      }
    }

    return filteredProducts;
  });
}

async function fetchProducts() {
  try {
    const productsResponse = await axios.get(PRODUCTS_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });

    const allProducts = productsResponse.data.data || [];
    const activeProducts = allProducts.filter(
      (product) => product.is_active === true
    );

    return activeProducts;
  } catch (error) {
    console.warn("Error fetching products from Lightspeed:", error.message);
    return [];
  }
}

async function fetchAndCacheProducts() {
  const cacheKey = cache.key('lightspeed', 'products', 'v1');
  return cache.getOrSet(cacheKey, runtimeConfig.cache.lsProductsTtl, async () => {
    logger.info("Fetching products from Lightspeed API");

    const response = await axios.get(PRODUCTS_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });

    const products = response.data.data || [];

    return products.filter((product) => product.is_active === true);
  });
}

async function fetchBrands() {
  try {
    const brandsResponse = await axios.get(BRANDS_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });
    return brandsResponse.data || [];
  } catch (error) {
    logger.warn({ err: error.message }, "Error fetching brands from Lightspeed");
    return [];
  }
}

async function fetchCategories() {
  try {
    const categoriesResponse = await axios.get(CATEGORIES_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });
    return categoriesResponse.data.data.data.categories || [];
  } catch (error) {
    logger.warn({ err: error.message }, "Error fetching categories from Lightspeed");
    return [];
  }
}

async function fetchAndCacheCategories() {
  const cacheKey = cache.key('lightspeed', 'categories', 'v1');
  return cache.getOrSet(cacheKey, runtimeConfig.cache.lsCategoriesTtl, async () => {
    logger.info("Fetching categories from Lightspeed API");

    const categoriesResponse = await axios.get(CATEGORIES_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });

    return categoriesResponse.data.data?.data?.categories || [];
  });
}

async function autoCacheProducts() {
  try {
    logger.info("Running scheduled cache refresh...");
    await filterAndCacheProductsByInventory();
  } catch (error) {
    logger.error({ err: error }, "Error in scheduled cache refresh:");
  }
}

const generateCouponCode = async () => {
  try {
    // Fetch only the last matching coupon — avoids loading the entire collection.
    const lastCouponDoc = await Coupon.findOne({ coupon: /^DH\d+YHZXB$/ })
      .sort({ _id: -1 })
      .select("coupon")
      .lean();

    let nextNumber = 1;
    if (lastCouponDoc) {
      const matches = lastCouponDoc.coupon.match(/DH(\d+)YHZXB/);
      if (matches && matches[1]) {
        nextNumber = parseInt(matches[1], 10) + 1;
      }
    }

    return `DH${nextNumber}YHZXB`;
  } catch (error) {
    logger.error({ err: error }, "Error generating the coupon code:");
    return "DH1YHZXB";
  }
};

const storeProductDetails = async (productIds, res, isProcessing) => {
  try {
    let count = 0;
    for (const id of productIds) {
      if (!isProcessing || !isClientConnected(res)) {
        logger.info("Processing stopped due to client disconnection");
        return;
      }
      count++;
      const { product, variantsData, totalQty } = await fetchProductDetails(id);

      const existingEntry = await Product.findOne({ "product.id": product.id });
      if (!existingEntry) {
        const newProductDetails = new Product({
          product,
          variantsData,
          totalQty,
        });
        await newProductDetails.save();
        console.log(
          `Added new product with ID: ${product.id} - Total Stored Products: ${count}`
        );
      } else {
        await Product.updateOne(
          { "product.id": product.id },
          {
            $set: {
              product,
              variantsData,
              totalQty,
            },
          }
        );
        console.log(
          `Updated product with ID: ${product.id} - Total Updated Products: ${count}`
        );
      }
    }
    logger.info("Products stored and processed successfully.");
    if (isClientConnected(res)) {
      return res.status(200).json({
        message: "Products stored and processed successfully.",
      });
    }
  } catch (error) {
    logger.error({ err: error }, "Error processing product details:");
    if (isClientConnected(res)) {
      return res.status(500).json({
        message: "Failed to process product details",
        error: error.message,
      });
    }
  }
};

const fetchProductDetails = async (id) => {
  try {
    const response = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/3.0/products/${id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    let product = response.data.data;
    if (!product) throw new Error("Product not found.");

    const variantsData = [];
    let totalQty = 0;

    if (product.variants.length === 0) {
      const inventoryResponse = await axios.get(
        `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${id}/inventory`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );
      const inventoryLevel =
        inventoryResponse.data.data?.[0]?.inventory_level || 0;

      if (
        inventoryLevel > 0 &&
        parseFloat(product.price_standard.tax_inclusive) !== 0
      ) {
        variantsData.push({
          qty: inventoryLevel,
          id: product.id,
          sku: product.sku_number,
          name: product.name,
          price: product.price_standard.tax_inclusive,
        });
        totalQty += inventoryLevel;
      }
    } else {
      for (const variant of product.variants) {
        const variantId = variant.id;
        const variantPrice = variant.price_standard.tax_inclusive;
        const variantDefinitions = variant.variant_definitions;
        let sku = "";
        if (variantDefinitions && variantDefinitions.length > 0) {
          const values = variantDefinitions.map((def) => def.value);
          sku = values.join(" - ");
        }
        const inventoryResponse = await axios.get(
          `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/products/${variantId}/inventory`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: "application/json",
            },
          }
        );
        const inventoryLevel =
          inventoryResponse.data.data?.[0]?.inventory_level || 0;

        if (inventoryLevel > 0 && parseFloat(variantPrice) !== 0) {
          variantsData.push({
            qty: inventoryLevel,
            sku: sku,
            price: variantPrice,
            id: variantId,
            name: variant.name,
          });
          totalQty += inventoryLevel;
        }
      }
    }
    return { product, variantsData, totalQty };
  } catch (error) {
    logger.error({ err: error, id }, 'Error fetching product details:');
    throw error;
  }
};

const fetchCouponDetails = async (id) => {
  try {
    const response = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/promotions/${id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    if (response?.data?.data) {
      return response.data.data;
    }

    logger.error("Invalid promotion response format.");
    return null;

  } catch (error) {
    logger.error({ err: error, id }, 'Error fetching coupon details:');
    return null;
  }
};
