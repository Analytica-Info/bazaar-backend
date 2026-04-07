const express = require("express");
const connectDB = require("../../config/db");
const Order = require("../../models/Order");
const OrderDetail = require("../../models/OrderDetail");
const Review = require("../../models/Review");
const Coupon = require("../../models/Coupon");
const BankPromoCode = require("../../models/BankPromoCode");
const BankPromoCodeUsage = require("../../models/BankPromoCodeUsage");
const Notification = require("../../models/Notification");
const Cart = require("../../models/Cart");
const NewsLetter = require("../../models/NewsLetter");
const { getAdminEmail, getCcEmails } = require("../../utilities/emailHelper");

function computeCartDiscountAED(subtotal, discountPercent, capAED) {
  const pct = Number(discountPercent) || 0;
  if (pct <= 0) return 0;
  const s = Number(subtotal);
  let byPercent = (s * pct) / 100;
  if (capAED != null && capAED !== "" && Number(capAED) > 0) {
    byPercent = Math.min(byPercent, Number(capAED));
  }
  return Math.round(byPercent * 100) / 100;
}

function cartSubtotalFromCartData(cartData) {
  return cartData.reduce(
    (s, item) => s + Number(item.price) * Number(item.qty),
    0
  );
}

async function resolveCheckoutDiscountAED({
  cartData,
  bankPromoId,
  discountPercent,
  discountAmount,
  capAED,
}) {
  const subtotalBefore = cartSubtotalFromCartData(cartData);
  if (bankPromoId) {
    try {
      const promo = await BankPromoCode.findById(bankPromoId).lean();
      if (promo && promo.active && new Date(promo.expiryDate) >= new Date()) {
        return {
          discountAED: computeCartDiscountAED(
            subtotalBefore,
            promo.discountPercent,
            promo.capAED
          ),
          subtotalBefore,
        };
      }
    } catch (e) {
      console.error("resolveCheckoutDiscountAED bankPromoId", e);
    }
  }
  const pct = Number(discountPercent) || 0;
  if (pct > 0) {
    return {
      discountAED: computeCartDiscountAED(subtotalBefore, pct, capAED),
      subtotalBefore,
    };
  }
  return {
    discountAED: Math.max(0, Number(discountAmount) || 0),
    subtotalBefore,
  };
}

async function clearUserCart(user_id) {
  try {
    const cart = await Cart.findOne({ user: user_id });
    if (cart) {
      cart.items = [];
      await cart.save();
      console.log(`Cart cleared for user: ${user_id}`);
    }
  } catch (err) {
    console.error("Error clearing cart:", err);
  }
}

function getUaeDateTime() {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === "year").value);
  const month = parseInt(parts.find(p => p.type === "month").value) - 1; // Month is 0-indexed
  const day = parseInt(parts.find(p => p.type === "day").value);
  const hour = parseInt(parts.find(p => p.type === "hour").value);
  const minute = parseInt(parts.find(p => p.type === "minute").value);
  const second = parseInt(parts.find(p => p.type === "second").value);
  const milliseconds = now.getMilliseconds();
  
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}+04:00`;
}

const Product = require("../../models/Product");
const ProductId = require("../../models/ProductId");
const ProductView = require("../../models/ProductView");
const User = require("../../models/User");
const Cronjoblog = require("../../models/Cronjoblog");
const CouponCms = require("../../models/CouponCms");
const HeaderInfoCms = require("../../models/HeaderInfo");
const SliderCms = require("../../models/SliderCms");
const FeaturesCms = require("../../models/FeaturesCms");
const OffersCms = require("../../models/OffersCms");
const CategoryImagesCms = require("../../models/CategoriesCms");
const OfferFilterCms = require("../../models/OfferFilter");
const FooterInfoCms = require("../../models/FooterInfoCms");
const AboutCms = require("../../models/About");
const ShopCms = require("../../models/Shop");
const ContactCms = require("../../models/ContactCms");
const BrandsLogoCms = require("../../models/BrandsLogo");
const CouponsCount = require("../../models/CouponsCount");
const mime = require("mime-types");
const Brand = require("../../models/Brand");
const Category = require("../../models/Category");
const stripe = require("stripe")(process.env.STRIPE_SK);
const cors = require("cors");
const axios = require("axios");
const compression = require("compression");
require("dotenv").config();
const { sendEmail } = require("../../mail/emailService");
const crypto = require("crypto");
const year = new Date().getFullYear();
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 1800 });
// Cache for spelling suggestions - 7 days TTL since spelling suggestions don't change
const spellingCache = new NodeCache({ stdTTL: 604800 }); // 7 days in seconds
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const Typo = require("typo-js");
const dictionary = new Typo("en_US");
const pako = require("pako");
const CartData = require("../../models/CartData");
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
const PendingPayment = require("../../models/PendingPayment");

const upload = multer({ dest: "temp/" });

// Configure multer for file uploads
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

exports.getCronLogs = async (req, res) => {
  try {
    const logs = await Cronjoblog.find({});
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: "Error fetching logs", error });
  }
};

exports.getCouponCount = async (req, res) => {
  try {
    const newCouponCount = await CouponsCount.findOne();
    if (!newCouponCount) {
      return res.status(404).json({ message: "Coupon count data not found" });
    }
    res.status(200).json({ couponCountData: newCouponCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching coupon count" });
  }
};

exports.updateCouponCount = async (req, res) => {
  try {
    const { count } = req.body;

    // Ensure count is a number to prevent unintended updates
    if (typeof count !== "number") {
      return res.status(400).json({ message: "Count must be a number" });
    }

    // Update the existing document by adding the new count
    const updatedCouponCount = await CouponsCount.findOneAndUpdate(
      {}, // Find any existing document
      { $inc: { count } }, // Increment the count field
      { new: true, upsert: true } // Return updated document, create if not exists
    );

    res.json({
      message: "Coupon count updated successfully",
      data: updatedCouponCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating coupon count" });
  }
};

exports.getCouponCms = async (req, res) => {
  try {
    const couponCms = await CouponCms.findOne();
    if (!couponCms) {
      return res.status(404).json({ message: "CouponCms data not found" });
    }
    res.status(200).json({ couponCmsData: couponCms });
  } catch (error) {
    console.error(`Error fetching CouponCms data: ${error.message}`);
    res
      .status(500)
      .json({ message: "Error fetching CouponCms data", error: error.message });
  }
};

exports.getCmsData = async (req, res) => {
  try {
    const couponCms = await CouponCms.findOne();
    const headerInfoCms = await HeaderInfoCms.findOne();
    const sliderCms = await SliderCms.findOne();
    const featuresCms = await FeaturesCms.findOne();
    const offersCms = await OffersCms.findOne();
    const categoryImagesCms = await CategoryImagesCms.findOne();
    const offerFilterCms = await OfferFilterCms.findOne();
    const footerInfoCms = await FooterInfoCms.findOne();
    const aboutCms = await AboutCms.findOne();
    const shopCms = await ShopCms.findOne();
    const contactCms = await ContactCms.findOne();
    const brandsLogoCms = await BrandsLogoCms.findOne();

    res.status(200).json({
      couponCmsData: couponCms,
      headerInfoCmsData: headerInfoCms,
      sliderCmsData: sliderCms,
      featuresCmsData: featuresCms,
      offersCmsData: offersCms,
      categoryImagesCmsData: categoryImagesCms,
      offerFilterCmsData: offerFilterCms,
      footerInfoCmsData: footerInfoCms,
      aboutCmsData: aboutCms,
      shopCmsData: shopCms,
      contactCmsData: contactCms,
      brandsLogoCmsData: brandsLogoCms,
    });
  } catch (error) {
    console.error(`Error fetching Cms data: ${error.message}`);
    res
      .status(500)
      .json({ message: "Error fetching Cms data", error: error.message });
  }
};

exports.CouponCms = [
  couponFormUpload.fields([
    { name: "logo", maxCount: 1 },
    { name: "mrBazaarLogo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        discountText,
        discountTextExtra,
        description,
        facebookLink,
        instagramLink,
        tikTokLink,
        youtubeLink,
      } = req.body;

      const logo = req.files["logo"] ? req.files["logo"][0] : null;
      const mrBazaarLogo = req.files["mrBazaarLogo"]
        ? req.files["mrBazaarLogo"][0]
        : null;

      // Find the existing record or create a new one
      let couponCms = await CouponCms.findOne();
      if (!couponCms) {
        couponCms = new CouponCms();
      }

      // Update text fields
      couponCms.discountText = discountText;
      couponCms.discountTextExtra = discountTextExtra;
      couponCms.description = description;
      couponCms.facebookLink = facebookLink;
      couponCms.instagramLink = instagramLink;
      couponCms.tikTokLink = tikTokLink;
      couponCms.youtubeLink = youtubeLink;

      // Handle logo upload
      if (logo) {
        deleteOldFile(couponCms.logo); // delete old file
        const relativePath = `/uploads/cms/CouponForm/${logo.filename}`;
        couponCms.logo = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      // Handle mrBazaarLogo upload
      if (mrBazaarLogo) {
        deleteOldFile(couponCms.mrBazaarLogo); // delete old file
        const relativePath = `/uploads/cms/CouponForm/${mrBazaarLogo.filename}`;
        couponCms.mrBazaarLogo = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      // Save the record
      await couponCms.save();

      res
        .status(200)
        .json({ message: "Coupon CMS data uploaded successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error uploading Coupon CMS data",
        error: error.message,
      });
    }
  },
];

exports.headerInfoCms = [
  headerInfoUpload.fields([{ name: "logo", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { contactNumber } = req.body;
      const logo = req.files["logo"] ? req.files["logo"][0] : null;

      let headerInfo = await HeaderInfoCms.findOne();
      if (!headerInfo) {
        headerInfo = new HeaderInfoCms();
      }

      headerInfo.contactNumber = contactNumber;

      if (logo) {
        // Delete old logo if exists
        deleteOldFile(headerInfo.logo);

        // Save new logo URL
        const relativePath = `/uploads/cms/HeaderInfo/${logo.filename}`;
        headerInfo.logo = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      await headerInfo.save();
      res.status(200).json({ message: "Header info saved successfully" });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error saving header info", error: error.message });
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
      const sliderImage1 = req.files["sliderImage1"]
        ? req.files["sliderImage1"][0]
        : null;
      const sliderImage2 = req.files["sliderImage2"]
        ? req.files["sliderImage2"][0]
        : null;
      const sliderImage3 = req.files["sliderImage3"]
        ? req.files["sliderImage3"][0]
        : null;

      // Find or create record
      let sliderCms = await SliderCms.findOne();
      if (!sliderCms) {
        sliderCms = new SliderCms();
      }

      // Handle sliderImage1
      if (sliderImage1) {
        deleteOldFile(sliderCms.sliderImage1);
        const relativePath = `/uploads/cms/SliderImages/${sliderImage1.filename}`;
        sliderCms.sliderImage1 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      // Handle sliderImage2
      if (sliderImage2) {
        deleteOldFile(sliderCms.sliderImage2);
        const relativePath = `/uploads/cms/SliderImages/${sliderImage2.filename}`;
        sliderCms.sliderImage2 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      // Handle sliderImage3
      if (sliderImage3) {
        deleteOldFile(sliderCms.sliderImage3);
        const relativePath = `/uploads/cms/SliderImages/${sliderImage3.filename}`;
        sliderCms.sliderImage3 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      // Save
      await sliderCms.save();

      res
        .status(200)
        .json({ message: "Slider  Images CMS data uploaded successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error uploading Slider Images CMS data",
        error: error.message,
      });
    }
  },
];

exports.featuresCms = async (req, res) => {
  try {
    const { features } = req.body;

    // Validate incoming data
    if (!Array.isArray(features)) {
      return res.status(400).json({ message: "Features must be an array" });
    }

    // Find or create
    let featureCms = await FeaturesCms.findOne();
    if (!featureCms) {
      featureCms = new FeaturesCms();
    }

    // Map features
    const featureData = features.map((f) => ({
      title: f?.title || "",
      paragraph: f?.paragraph || "",
    }));

    featureCms.featureData = featureData;
    await featureCms.save();

    res.status(200).json({ message: "Data uploaded successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error uploading data",
      error: error.message,
    });
  }
};

exports.offersCms = [
  offersUpload.array("offerImage", 3), // up to 3 images
  async (req, res) => {
    try {
      const offerImages = req.files || [];
      const offerCategories = req.body.offerCategory || [];

      const categoriesArray = Array.isArray(offerCategories)
        ? offerCategories
        : [offerCategories];

      let offersCms = await OffersCms.findOne();
      if (!offersCms) {
        offersCms = new OffersCms({ offersData: [] });
      }

      // Copy existing offers data
      let updatedOffersData = [...offersCms.offersData];

      // Update only the slots where a new file is uploaded
      offerImages.forEach((file, index) => {
        // If there was an old image at this index, delete it
        if (updatedOffersData[index] && updatedOffersData[index].offerImage) {
          deleteOldFile(updatedOffersData[index].offerImage);
        }

        // Replace or add new entry
        updatedOffersData[index] = {
          offerImage: `${BACKEND_URL}/uploads/cms/Offers/${
            file.filename
          }?v=${Date.now()}`,
          offerCategory: categoriesArray[index] || "",
        };
      });

      // Save updates
      offersCms.offersData = updatedOffersData;
      await offersCms.save();

      res.status(200).json({ message: "Offers updated successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error uploading offers",
        error: error.message,
      });
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
      let categoryImagesCms = await CategoryImagesCms.findOne();
      if (!categoryImagesCms) {
        categoryImagesCms = new CategoryImagesCms();
      }

      const categories = [
        "Electronics",
        "Home",
        "Sports",
        "Toys",
        "Home_Improvement",
      ];

      for (const category of categories) {
        const file = req.files[category] ? req.files[category][0] : null;
        if (file) {
          // Delete old image if exists
          deleteOldFile(categoryImagesCms[category]);

          // Save new image URL
          const relativePath = `/uploads/cms/CategoryImages/${file.filename}`;
          categoryImagesCms[
            category
          ] = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
        }
      }

      await categoryImagesCms.save();

      res.status(200).json({ message: "Data uploaded successfully" });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error uploading data", error: error.message });
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
      const { MinPrice1, MaxPrice1, MinPrice2, MaxPrice2 } = req.body;
      const Image1 = req.files["Image1"]?.[0] || null;
      const Image2 = req.files["Image2"]?.[0] || null;

      // Validate price ranges
      if (
        parseInt(MinPrice1) > parseInt(MaxPrice1) ||
        parseInt(MinPrice2) > parseInt(MaxPrice2)
      ) {
        return res.status(400).json({ error: "Invalid price range" });
      }

      // Find or create the document
      let offerFilterCms = await OfferFilterCms.findOne();
      if (!offerFilterCms) {
        offerFilterCms = new OfferFilterCms();
      }

      // Always update price ranges
      offerFilterCms.PriceRange1 = {
        ...offerFilterCms.PriceRange1,
        MinPrice1: parseInt(MinPrice1),
        MaxPrice1: parseInt(MaxPrice1),
      };

      offerFilterCms.PriceRange2 = {
        ...offerFilterCms.PriceRange2,
        MinPrice2: parseInt(MinPrice2),
        MaxPrice2: parseInt(MaxPrice2),
      };

      // Process images if provided
      if (Image1) {
        // Delete old image if exists
        deleteOldFile(offerFilterCms.PriceRange1?.Image1);

        // Save new image URL
        const relativePath = `/uploads/cms/OfferFilter/${Image1.filename}`;
        offerFilterCms.PriceRange1.Image1 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      if (Image2) {
        // Delete old image if exists
        deleteOldFile(offerFilterCms.PriceRange2?.Image2);

        // Save new image URL
        const relativePath = `/uploads/cms/OfferFilter/${Image2.filename}`;
        offerFilterCms.PriceRange2.Image2 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      await offerFilterCms.save();

      res.status(200).json({ message: "Data updated successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Error processing request",
        error: error.message,
      });
    }
  },
];

exports.FooterInfoCms = [
  footerInfoUpload.fields([{ name: "logo", maxCount: 1 }]),
  async (req, res) => {
    try {
      const {
        tagLine,
        address,
        email,
        phone,
        facebook,
        tiktok,
        instagram,
        youtube,
      } = req.body;

      const logo = req.files["logo"] ? req.files["logo"][0] : null;

      let footerInfoCms = await FooterInfoCms.findOne();
      if (!footerInfoCms) {
        footerInfoCms = new FooterInfoCms();
      }

      // Update text/social fields
      footerInfoCms.tagLine = tagLine;
      footerInfoCms.address = address;
      footerInfoCms.email = email;
      footerInfoCms.phone = phone;
      footerInfoCms.facebook = facebook;
      footerInfoCms.tiktok = tiktok;
      footerInfoCms.instagram = instagram;
      footerInfoCms.youtube = youtube;

      if (logo) {
        // Delete old logo if exists
        deleteOldFile(footerInfoCms.logo);

        // Save new logo URL
        const relativePath = `/uploads/cms/FooterInfo/${logo.filename}`;
        footerInfoCms.logo = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      await footerInfoCms.save();

      res.status(200).json({ message: "Data uploaded successfully" });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error uploading data", error: error.message });
    }
  },
];

exports.AboutCms = [
  aboutUpload.fields([{ name: "backgroundImage", maxCount: 1 }]),
  async (req, res) => {
    try {
      let contents = [];
      if (req.body.contents) {
        try {
          contents = JSON.parse(req.body.contents);
        } catch (err) {
          return res.status(400).json({ message: "Invalid contents format" });
        }
      }

      const backgroundImage = req.files["backgroundImage"]
        ? req.files["backgroundImage"][0]
        : null;

      let aboutCms = await AboutCms.findOne();
      if (!aboutCms) {
        aboutCms = new AboutCms();
      }

      // Update contents
      aboutCms.contents = contents;

      if (backgroundImage) {
        // Delete old background image if exists
        deleteOldFile(aboutCms.backgroundImage);

        // Save new image URL
        const relativePath = `/uploads/cms/About/${backgroundImage.filename}`;
        aboutCms.backgroundImage = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      await aboutCms.save();

      res.status(200).json({ message: "Data uploaded successfully" });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error uploading data", error: error.message });
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
      const Image1 = req.files["Image1"] ? req.files["Image1"][0] : null;
      const Image2 = req.files["Image2"] ? req.files["Image2"][0] : null;

      let shopCms = await ShopCms.findOne();
      if (!shopCms) {
        shopCms = new ShopCms();
      }

      if (Image1) {
        // Delete old file
        deleteOldFile(shopCms.Image1);

        // Save new file URL
        const relativePath = `/uploads/cms/Shop/${Image1.filename}`;
        shopCms.Image1 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      if (Image2) {
        deleteOldFile(shopCms.Image2);
        const relativePath = `/uploads/cms/Shop/${Image2.filename}`;
        shopCms.Image2 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }

      await shopCms.save();

      res.status(200).json({ message: "Data uploaded successfully" });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ message: "Error uploading data", error: error.message });
    }
  },
];

exports.contactCms = async (req, res) => {
  try {
    const { tagLine, address, email, phone, facebook, tiktok, instagram } =
      req.body;

    // Find the existing record or create a new one if it doesn't exist
    let contactCms = await ContactCms.findOne();
    if (!contactCms) {
      contactCms = new ContactCms();
    }

    // Update fields
    contactCms.tagLine = tagLine;
    contactCms.address = address;
    contactCms.email = email;
    contactCms.phone = phone;
    contactCms.facebook = facebook;
    contactCms.tiktok = tiktok;
    contactCms.instagram = instagram;

    // Save the updated (or new) record
    await contactCms.save();

    res.status(200).json({ message: "Data uploaded successfully" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error uploading data", error: error.message });
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
      let brandsLogoCms = await BrandsLogoCms.findOne();
      if (!brandsLogoCms) brandsLogoCms = new BrandsLogoCms();
      const oldImages = brandsLogoCms.images || [];
      const updatedImages = [...oldImages];

      for (let i = 0; i < 20; i++) {
        const fileArray = req.files[`logo${i}`];
        if (fileArray && fileArray.length > 0) {
          const file = fileArray[0];
          // Optionally delete oldImages[i] here!
          updatedImages[i] = `${BACKEND_URL}/uploads/cms/BrandsLogo/${
            file.filename
          }?v=${Date.now()}`;
        }
      }

      brandsLogoCms.images = updatedImages;
      await brandsLogoCms.save();

      res.status(200).json({ message: "Data uploaded successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error uploading data", error: error.message });
    }
  },
];

exports.search = async (req, res) => {
  try {
    const { search } = req.body;
    console.log("Seacrh term", search);
    if (!search) {
      return res.status(400).json({ error: "Search term is required" });
    }

    let products = await Product.find({
      $or: [
        { "product.name": { $regex: search, $options: "i" } },
        { "product.description": { $regex: search, $options: "i" } },
      ],
    });
    products = products.filter((product) => product.status === true);

    // Filter products that have variantsData with length > 0 and images
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
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.createCardCheckout = async (req, res) => {
  const {
    cartData,
    shippingCost,
    name,
    phone,
    address,
    currency,
    city,
    area,
    buildingName,
    floorNo,
    apartmentNo,
    landmark,
    discountPercent,
    couponCode,
    mobileNumber,
    paymentMethod,
    discountAmount,
    totalAmount,
    subTotalAmount,
    saved_total,
    bankPromoId,
    capAED,
  } = req.body;

  // const totalAmount =
  //   cartData.reduce((total, item) => total + item.price * item.qty, 0) +
  //   shippingCost;
  // const subTotalAmount = cartData.reduce(
  //   (total, item) => total + item.price * item.qty,
  //   0
  // );

  // Save cart data to the database
  const cartDataEntry = await CartData.create({ cartData: cartData });
  const cartDataId = cartDataEntry._id; // Get the ID of the saved cart data

  // Stripe session % coupons apply to the whole session (items + shipping). We only discount
  // cart subtotal — bake that into line item unit prices; shipping stays full.
  // Discount matches frontend + BankPromoCode (when bankPromoId): same % and cap as admin.
  const { discountAED: disc, subtotalBefore } = await resolveCheckoutDiscountAED({
    cartData,
    bankPromoId,
    discountPercent,
    discountAmount,
    capAED,
  });
  const subtotalAfter = Math.max(0, subtotalBefore - disc);
  const totalBeforeCents = Math.round(subtotalBefore * 100);
  const totalAfterCents = Math.round(subtotalAfter * 100);

  let lineItems;
  if (disc > 0 && subtotalBefore > 0 && totalBeforeCents > 0) {
    let allocatedCents = 0;
    lineItems = cartData.map((item, index) => {
      const lineBeforeCents = Math.round(Number(item.price) * 100) * Number(item.qty);
      let lineAfterCents;
      if (index === cartData.length - 1) {
        lineAfterCents = totalAfterCents - allocatedCents;
      } else {
        lineAfterCents = Math.round(
          totalAfterCents * (lineBeforeCents / totalBeforeCents)
        );
        allocatedCents += lineAfterCents;
      }
      const qty = Number(item.qty) || 1;
      const unitCents = Math.max(1, Math.round(lineAfterCents / qty));
      return {
        price_data: {
          currency: currency,
          product_data: {
            name: item.name,
            description: item.variant || "",
          },
          unit_amount: unitCents,
        },
        quantity: qty,
      };
    });
  } else {
    lineItems = cartData.map((item) => ({
      price_data: {
        currency: currency,
        product_data: {
          name: item.name,
          description: item.variant || "",
        },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: Number(item.qty),
    }));
  }

  try {
    if (shippingCost) {
      lineItems.push({
        price_data: {
          currency: currency,
          product_data: {
            name: "Shipping Cost",
          },
          unit_amount: Math.round(Number(shippingCost) * 100),
        },
        quantity: 1,
      });
    }

    let sessionOptions = {
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/failed`,
      metadata: {
        name: name,
        phone: phone,
        address: address,
        city: city || '',
        area: area || '',
        buildingName: buildingName || '',
        floorNo: String(floorNo ?? ''),
        apartmentNo: String(apartmentNo ?? ''),
        landmark: landmark || '',
        totalAmount: totalAmount,
        subTotalAmount: subTotalAmount,
        saved_total: saved_total,
        shippingCost: shippingCost,
        currency: currency,
        cartDataId: cartDataId.toString(),
        couponCode: couponCode || '',
        mobileNumber: mobileNumber || '',
        paymentMethod: paymentMethod,
        discountAmount: discountAmount,
        bankPromoId: bankPromoId || '',
      },
    };

    const session = await stripe.checkout.sessions.create(sessionOptions);
    res.status(200).json({ id: session.id });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.createTabbyCheckout = async (req, res) => {
  try {
    const { customerOrderData, orderData, paymentMethod } = req.body;
    const { payment, merchant_urls, merchant_code, lang } = customerOrderData;

    const {
      cartData,
      shippingCost,
      name,
      phone,
      address,
      currency,
      city,
      area,
      buildingName,
      floorNo,
      apartmentNo,
      landmark,
      discountPercent,
      couponCode,
      mobileNumber,
      saved_total,
      bankPromoId,
      discountAmount,
      capAED,
    } = orderData;

    const { discountAED: tabbyDisc, subtotalBefore: subtotalAmount } =
      await resolveCheckoutDiscountAED({
        cartData,
        bankPromoId,
        discountPercent,
        discountAmount,
        capAED,
      });

    const tabbyTotalAED = Math.round(
      (subtotalAmount - tabbyDisc + Number(shippingCost || 0)) * 100
    ) / 100;
    payment.amount = String(tabbyTotalAED);
    if (!payment.order) payment.order = {};
    payment.order.discount_amount = tabbyDisc.toFixed(2);
    payment.order.shipping_amount = String(shippingCost || 0);

    // Save cart data to the database
    const cartDataEntry = await CartData.create({ cartData: cartData });
    const cartDataId = cartDataEntry._id;

    // Convert all meta values to strings for Tabby
    payment.meta = {
      ...(payment.meta || {}),
      name: String(name),
      phone: String(phone),
      address: String(address),
      city: String(city || ""),
      area: String(area || ""),
      buildingName: String(buildingName || ""),
      floorNo: String(floorNo || ""),
      apartmentNo: String(apartmentNo || ""),
      landmark: String(landmark || ""),
      subtotalAmount: String(subtotalAmount),
      shippingCost: String(shippingCost || 0),
      currency: String(currency),
      cartDataId: String(cartDataId),
      couponCode: String(couponCode || ""),
      mobileNumber: String(mobileNumber || ""),
      paymentMethod: String(paymentMethod),
      discountPercent: String(discountPercent || 0),
      saved_total: String(saved_total || 0),
      bankPromoId: String(bankPromoId || ""),
    };

    // Ensure all payment fields are properly formatted
    const requestBody = {
      payment: {
        amount: String(payment.amount),
        currency: String(payment.currency).toUpperCase(),
        description: String(payment.description),
        buyer: {
          name: String(payment.buyer.name),
          phone: String(payment.buyer.phone),
          email: String(payment.buyer.email),
          dob: String(payment.buyer.dob || ""),
        },
        shipping_address: {
          city: String(payment.shipping_address.city),
          address: String(payment.shipping_address.address),
          zip: String(payment.shipping_address.zip || ""),
        },
        order: {
          tax_amount: String(payment.order.tax_amount),
          shipping_amount: String(payment.order.shipping_amount),
          discount_amount: String(payment.order.discount_amount),
          saved_total: String(payment.order.saved_total),
          updated_at: payment.order.updated_at,
          reference_id: String(payment.order.reference_id),
          items: payment.order.items.map((item) => ({
            title: String(item.title),
            description: String(item.description || ""),
            quantity: Number(item.quantity),
            unit_price: String(item.unit_price),
            discount_amount: String(item.discount_amount || "0.00"),
            reference_id: String(item.reference_id),
            image_url: String(item.image_url),
            product_url: String(item.product_url),
            category: String(item.category || "general"),
            brand: String(item.brand || "Your Store Brand"),
            is_refundable: Boolean(item.is_refundable !== false),
            gender: String(item.gender || "Unisex"),
            color: String(item.color || ""),
            product_material: String(item.product_material || ""),
            size_type: String(item.size_type || ""),
            size: String(item.size || ""),
          })),
        },
        buyer_history: {
          registered_since: payment.buyer_history.registered_since,
          loyalty_level: Number(payment.buyer_history.loyalty_level || 0),
          wishlist_count: Number(payment.buyer_history.wishlist_count || 0),
          is_social_networks_connected: Boolean(
            payment.buyer_history.is_social_networks_connected
          ),
          is_phone_number_verified: Boolean(
            payment.buyer_history.is_phone_number_verified
          ),
          is_email_verified: Boolean(payment.buyer_history.is_email_verified),
        },
        order_history: payment.order_history || [],
        meta: payment.meta,
      },
      lang: String(lang || "en"),
      merchant_code: String(merchant_code),
      merchant_urls: {
        success: String(merchant_urls.success),
        cancel: String(merchant_urls.cancel),
        failure: String(merchant_urls.failure),
      },
    };

    const tabbyResponse = await fetch("https://api.tabby.ai/api/v2/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await tabbyResponse.json();

    if (tabbyResponse.ok) {
      if (data.status === "rejected") {
        const rejectionReason =
          data.message ||
          data.reason ||
          "Sorry, Tabby is unable to approve this purchase. Please use an alternative payment method for your order.";

        return res.status(400).json({
          status: "rejected",
          message: rejectionReason,
        });
      }

      const installments =
        data?.configuration?.available_products?.installments || [];

      const checkout_url =
        installments.length > 0 ? installments[0]?.web_url : null;

      if (checkout_url && data.status === "created") {
        return res.json({
          checkout_url,
          status: data.status,
        });
      } else {
        return res
          .status(500)
          .json({ message: "No available products in Tabby configuration" });
      }
    } else {
      console.error("Tabby API Error:", {
        status: tabbyResponse.status,
        data: data,
        sentPayload: requestBody,
      });

      return res.status(tabbyResponse.status).json({
        message: data.message || "Failed to create Tabby checkout",
        error: data,
      });
    }
  } catch (error) {
    console.error("Tabby checkout error:", error);
    
    // Log Tabby checkout creation failure
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

// Helper function to create a fixed amount coupon

async function createPercentageCoupon(percent) {
  const coupon = await stripe.coupons.create({
    percent_off: percent,
    duration: "once",
  });
  return coupon.id;
}

exports.verifyCardPayment = async (req, res) => {
  try {
    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Verify Card Payment API Hit',
      status: 'success',
      message: `verifyCardPayment API hit - user: ${req.user?._id || 'n/a'}, email: ${req.user?.email || req.body?.user_email || 'n/a'}, sessionId: ${req.body?.sessionId || 'n/a'}. Order data: cartDataId, shippingCost, name, phone, address, state, city, area, floorNo, buildingName, apartmentNo, landmark, currency, discountAmount, couponCode, mobileNumber, paymentMethod, totalAmount, subTotalAmount, saved_total`,
      execution_path: 'publicController.verifyCardPayment (initial)'
    });

    const { sessionId } = req.body;
    const user_id = req.user?._id;
    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata || {};
    const {
      shippingCost,
      name,
      phone,
      address,
      currency,
      totalAmount,
      subTotalAmount,
      city,
      area,
      buildingName,
      floorNo,
      apartmentNo,
      landmark,
      couponCode,
      mobileNumber,
      paymentMethod,
      discountAmount,
      saved_total,
      bankPromoId,
    } = metadata || {};

    const state = metadata?.state || '-';

    // Retrieve cart data using the stored ID
    const cartDataId = metadata.cartDataId;
    const cartDataEntry = await CartData.findById(cartDataId);
    const cartData = cartDataEntry.cartData; // Get the cart data

    const formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    // const formatted_total_amount = formatter.format(amount);

    let formattedshippingCost = 0;
    if (shippingCost) {
      formattedshippingCost = formatter.format(shippingCost);
    } else {
      formattedshippingCost = formatter.format(0);
    }

    if (session.payment_status === "paid") {
      // Check if couponCode and mobileNumber exist in the metadata
      if (couponCode && mobileNumber) {
        // Find the coupon in the database
        const coupon = await Coupon.findOne({
          coupon: couponCode,
          phone: mobileNumber,
        });

        if (coupon) {
          // Update the status from 'unused' to 'used'
          coupon.status = "used";
          await coupon.save();
          console.log(`Coupon ${couponCode} status updated to 'used'.`);
        } else {
          console.log(
            `Coupon ${couponCode} not found or does not match the mobile number.`
          );
        }
      }

      if (bankPromoId && user_id) {
        try {
          const promo = await BankPromoCode.findById(bankPromoId);
          if (promo) {
            const existing = await BankPromoCodeUsage.findOne({
              bankPromoCodeId: promo._id,
              userId: user_id,
            });
            if (!existing) {
              await BankPromoCodeUsage.create({
                bankPromoCodeId: promo._id,
                userId: user_id,
              });
              promo.usageCount = (promo.usageCount || 0) + 1;
              await promo.save();
              console.log(`Bank promo ${promo.code} usage recorded for user ${user_id}.`);
            }
          }
        } catch (err) {
          console.error("Error recording bank promo usage:", err);
        }
      }

      const txn_id = session.payment_intent; // This is the unique transaction ID in Stripe
      const payment_status = session.payment_status; // Payment status (e.g., 'paid', 'unpaid', etc.)
      const stripe_checkout_session_id = session.id; // The Stripe checkout session ID
      const userEmail = session.customer_details.email;

      const formatDate = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Dubai",
      });

      const formatTime = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Dubai",
      });

      const orderDateTime = `${formatDate} - ${formatTime}`;

      const paymentId = session.id || session.payment_intent;
      const methodForDb = (paymentMethod && paymentMethod.toLowerCase() === 'tabby') ? 'tabby' : 'stripe';
      const pendingPayment = new PendingPayment({
        user_id: user_id,
        payment_id: paymentId,
        payment_method: methodForDb,
        order_data: {
          cartData,
          shippingCost,
          name,
          phone,
          address,
          state: state || '-',
          city,
          area,
          floorNo,
          buildingName,
          apartmentNo,
          landmark,
          currency,
          discountPercent: metadata?.discountPercent ?? null,
          discountAmount,
          couponCode,
          mobileNumber,
          user_email: session.customer_details?.email ?? userEmail,
          total: totalAmount,
          sub_total: subTotalAmount,
          txnId: session.payment_intent,
          paymentStatus: session.payment_status,
          fcmToken: null,
          saved_total: saved_total ?? null
        },
        status: 'completed',
        orderfrom: 'Website',
        orderTime: orderDateTime
      });
      await pendingPayment.save();

      const lastOrder = await Order.findOne()
        .sort({ createdAt: -1 }) // Get the latest order by creation date
        .select("order_no"); // Only fetch the order_no field

      let nextOrderNo = 1; // Default to 1 if no orders exist
      if (lastOrder && lastOrder.order_no) {
        nextOrderNo = lastOrder.order_no + 1; // Increment the last order_no
      }

      const uniquePart = crypto
        .randomBytes(2)
        .toString("hex")
        .toUpperCase()
        .slice(0, 3); // 3 alphanumeric chars

      const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(
        3,
        "0"
      )}${uniquePart}`;

      const orderPayload = {
        userId: user_id,
        order_id: nextOrderId, // Professional order ID
        order_no: nextOrderNo, // Sequential order number
        order_datetime: orderDateTime,
        name,
        email: userEmail,
        address,
        state: '-',
        city: city || '-',
        area: area || '-',
        buildingName: buildingName || '-',
        floorNo: floorNo || '-',
        apartmentNo: apartmentNo || '-',
        landmark: landmark || '-',
        amount_subtotal: subTotalAmount,
        amount_total: totalAmount,
        discount_amount: discountAmount,
        phone,
        status: "confirmed",
        shipping: shippingCost,
        txn_id: txn_id,
        payment_status: payment_status,
        checkout_session_id: stripe_checkout_session_id,
        payment_method: paymentMethod,
        saved_total: saved_total || 0,
        orderfrom: 'Website',

      };
      const order = await Order.create(orderPayload);

      // Log order creation
      const user = await User.findById(user_id);
      await logActivity({
        platform: 'Website Backend',
        log_type: 'backend_activity',
        action: 'Order Creation',
        status: 'success',
        message: `Order ${nextOrderId} created successfully`,
        user: user || { userId: user_id, name, email: userEmail },
        details: { order_id: nextOrderId }
      });
      
      // Log to backend logger
      await logBackendActivity({
        platform: 'Website Backend',
        activity_name: 'Order Creation',
        status: 'success',
        message: `Order ${nextOrderId} created successfully`,
        order_id: nextOrderId,
        execution_path: 'publicController.verifyCardPayment -> Order.create'
      });

      const orderDetails = cartData.map((item) => ({
        order_id: order._id,
        product_id: item.id,
        productId: item.product_id,
        product_name: item.name,
        product_image: item.image,
        variant_name: item.variant,
        amount: item.price,
        quantity: item.qty,
      }));

      await OrderDetail.insertMany(orderDetails);

      console.log("ENVIRONMENT", ENVIRONMENT);
      if (ENVIRONMENT === "true") {
        try {
          const results = await updateQuantities(cartData, nextOrderId);
          console.log("Update results:", results);
            // Log inventory update success
          await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Inventory Update',
            status: 'success',
            message: `Inventory updated for order ${nextOrderId}`,
            user: user || { userId: user_id, name, email: userEmail },
            details: { order_id: nextOrderId, results }
          });
        } catch (inventoryError) {
          // Log inventory update failure
          await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Inventory Update',
            status: 'failure',
            message: `Inventory update failed for order ${nextOrderId}`,
            user: user || { userId: user_id, name, email: userEmail },
            details: { 
              order_id: nextOrderId, 
              error_details: inventoryError.message 
            }
          });
          
          // Log to backend logger
          await logBackendActivity({
            platform: 'Website Backend',
            activity_name: 'Inventory Update Batch',
            status: 'failure',
            message: `Inventory update batch failed for order ${nextOrderId}`,
            order_id: nextOrderId,
            execution_path: 'publicController.verifyCardPayment -> updateQuantities',
            error_details: inventoryError.message
          });
        }
      }

      const currentDate = new Date();
      const deliveryDate = new Date(
        currentDate.getTime() + 3 * 24 * 60 * 60 * 1000
      );
      const day = deliveryDate.getDate();
      const dayOfWeek = deliveryDate.toLocaleString("default", {
        weekday: "long",
      });
      const month = deliveryDate.toLocaleString("default", { month: "long" });
      const formattedDeliveryDate = `${dayOfWeek}, ${day} ${month}`;

      const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
      const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
      const adminEmail = await getAdminEmail();
      const logoUrl = `${WEBURL}/images/logo.png`;

      function toCapitalCase(str) {
        if (!str) return "";
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
      }

      const formattedPaymentMethod = toCapitalCase(paymentMethod);

      const ccEmails = await getCcEmails();

      const purchaseDetails = cartData
        .map(
          (data) => `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.name}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${data.price}</td>
                </tr>
                `
        )
        .join("");

      const html = `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: bold; margin-top: 10px; margin-bottom: 6px;"><b>Payment Method:</b> ${formattedPaymentMethod}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>A new order has been placed on Bazaar.</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Below are the order details:</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Please review and process the order at your earliest convenience.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Thank you for your continued support in ensuring excellent service for our customers.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead style="text-align: center;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                    ${purchaseDetails}
                                                </tbody>


                                                        <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${subTotalAmount}</b></th>
                                                    </tr>
                                                </thead>
                                                
                                                <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                    </tr>
                                                </thead>
                                          
                                                 

                                                 <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discountAmount}</b></th>
                                                    </tr>
                                                </thead>
                                                
                                                 <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${totalAmount}</b></th>
                                                    </tr>
                                                </thead>
                                              
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Customer Information</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${landmark || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${phone}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0; padding-left: 15px; padding-right: 15px;">&copy; <strong>bazaar-uae.com</strong> </p>
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

      const html1 = `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>Get it By:</b> ${formattedDeliveryDate}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: bold; margin-top: 10px; margin-bottom: 6px;"><b>Payment Method:</b> ${formattedPaymentMethod}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>${name}</b>! Thank you for your order with Bazaar!</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">We have received your order and are processing it. Below are the details of your purchase</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">If you have any questions about your order, feel free to reply to this email or contact our support team.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">We appreciate your business and look forward to serving you again soon!</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead style="text-align: center;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                    ${purchaseDetails}
                                                </tbody>
                                              
                                               <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${subTotalAmount}</b></th>
                                                    </tr>
                                                </thead>
                                                  <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                    </tr>
                                                </thead>
                                                 <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${discountAmount}</b></th>
                                                    </tr>
                                                </thead>
                                                 <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${totalAmount}</b></th>
                                                    </tr>
                                                </thead>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                        
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Billing Details</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${landmark || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${phone}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0; padding-left: 15px; padding-right: 15px;">&copy; <strong>bazaar-uae.com</strong> </p>
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

      // Send emails and log
      try {
        await sendEmail(adminEmail, adminSubject, html, ccEmails);
        await logActivity({
          platform: 'Website Backend',
          log_type: 'backend_activity',
          action: 'Email Sending',
          status: 'success',
          message: `Admin email sent for order ${nextOrderId}`,
          user: user || { userId: user_id, name, email: userEmail },
          details: { order_id: nextOrderId, recipient: adminEmail }
        });
        
        // Log to backend logger
        await logBackendActivity({
          platform: 'Website Backend',
          activity_name: 'Email Sending',
          status: 'success',
          message: `Admin email sent for order ${nextOrderId}`,
          order_id: nextOrderId,
          execution_path: 'publicController.verifyCardPayment -> sendEmail'
        });
      } catch (adminEmailError) {
        await logActivity({
          platform: 'Website Backend',
          log_type: 'backend_activity',
          action: 'Email Sending',
          status: 'failure',
          message: `Failed to send admin email for order ${nextOrderId}`,
          user: user || { userId: user_id, name, email: userEmail },
          details: { 
            order_id: nextOrderId, 
            recipient: adminEmail,
            error_details: adminEmailError.message 
          }
        });
        
        // Log to backend logger
        await logBackendActivity({
          platform: 'Website Backend',
          activity_name: 'Email Sending',
          status: 'failure',
          message: `Failed to send admin email for order ${nextOrderId}`,
          order_id: nextOrderId,
          execution_path: 'publicController.verifyCardPayment -> sendEmail',
          error_details: adminEmailError.message
        });
      }

      try {
        await sendEmail(userEmail, userSubject, html1);
        await logActivity({
          platform: 'Website Backend',
          log_type: 'backend_activity',
          action: 'Email Sending',
          status: 'success',
          message: `User email sent for order ${nextOrderId}`,
          user: user || { userId: user_id, name, email: userEmail },
          details: { order_id: nextOrderId, recipient: userEmail }
        });
        
        // Log to backend logger
        await logBackendActivity({
          platform: 'Website Backend',
          activity_name: 'Email Sending',
          status: 'success',
          message: `User email sent for order ${nextOrderId}`,
          order_id: nextOrderId,
          execution_path: 'publicController.verifyCardPayment -> sendEmail'
        });
      } catch (userEmailError) {
        await logActivity({
          platform: 'Website Backend',
          log_type: 'backend_activity',
          action: 'Email Sending',
          status: 'failure',
          message: `Failed to send user email for order ${nextOrderId}`,
          user: user || { userId: user_id, name, email: userEmail },
          details: { 
            order_id: nextOrderId, 
            recipient: userEmail,
            error_details: userEmailError.message 
          }
        });
        
        // Log to backend logger
        await logBackendActivity({
          platform: 'Website Backend',
          activity_name: 'Email Sending',
          status: 'failure',
          message: `Failed to send user email for order ${nextOrderId}`,
          order_id: nextOrderId,
          execution_path: 'publicController.verifyCardPayment -> sendEmail',
          error_details: userEmailError.message
        });
      }

      await Notification.create({
        userId: user_id,
        title: `Order No: ${order.order_id} Placed Successfully`,
        message: `Hi ${name}, your order of AED ${Number(totalAmount).toFixed(2)} is confirmed. Expected by ${formattedDeliveryDate}. Thank you for shopping with Bazaar!`,
      });

      await clearUserCart(user_id);

      order.orderTracks.push({
        status: "Confirmed",
        dateTime: getUaeDateTime(),
        image: null,
      });

      await order.save();

      res.status(200).json({
        message: "Order created successfully",
        orderId: order._id,
      });
    } else {
      res.status(400).json({ message: "Payment not successful." });
    }
  } catch (error) {
    console.error(error);
    
    // Log payment verification failure
    const user = req.user || {};
    await logActivity({
      platform: 'Website Backend',
      log_type: 'backend_activity',
      action: 'Payment Verification',
      status: 'failure',
      message: `Card payment verification failed: ${error.message}`,
      user: user,
      details: { 
        error_details: error.message,
        stack: error.stack 
      }
    });
    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Verify Card Payment API Hit',
      status: 'failure',
      message: `verifyCardPayment failed: ${error.message}`,
      execution_path: 'publicController.verifyCardPayment (catch)',
      error_details: error.message
    });
    
    res.status(500).json({ error: error.message });
  }
};


async function createOrderAndSendEmails(payment, user_id) {

  // 1. Idempotency: Check if order already exists
  let order = await Order.findOne({ txn_id: payment.id });
  if (order) {
    return order; // Already processed
  }

  // 2. Extract cart and user info from payment metadata
  const {
    cartDataId,
    city,
    area,
    buildingName,
    floorNo,
    apartmentNo,
    landmark,
    couponCode,
    mobileNumber,
    paymentMethod,
    discountPercent,
  } = payment.meta || {};

  if (!cartDataId) throw new Error("Missing cartDataId in payment metadata");

  const cartDataEntry = await CartData.findById(cartDataId);
  if (!cartDataEntry) {
    throw new Error("Cart data not found");
  }
  const cartData = cartDataEntry.cartData;

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const shippingCost = payment.order.shipping_amount || 0;

  let formattedshippingCost = 0;
  if (shippingCost) {
    formattedshippingCost = formatter.format(shippingCost);
  } else {
    formattedshippingCost = formatter.format(0);
  }

  const amount_subtotal = payment.meta.subtotalAmount;
  const formatted_subtotal_amount = formatter.format(amount_subtotal);

  const amount_total = payment.amount;
  const formatted_total_amount = formatter.format(amount_total);

  const discountAmount = payment.order.discount_amount || 0;
  const formattedDiscountAmount = formatter.format(discountAmount);

  if (couponCode && mobileNumber) {
    const coupon = await Coupon.findOne({
      coupon: couponCode,
      phone: mobileNumber,
    });
    if (coupon && coupon.status !== "used") {
      coupon.status = "used";
      await coupon.save();
      console.log(`Coupon ${couponCode} status updated to 'used'.`);
    }
  }

  const formatDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
  const formatTime = new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dubai",
  });
  const orderDateTime = `${formatDate} - ${formatTime}`;

  const lastOrder = await Order.findOne()
    .sort({ createdAt: -1 })
    .select("order_no");
  let nextOrderNo = 1;
  if (lastOrder && lastOrder.order_no) {
    nextOrderNo = lastOrder.order_no + 1;
  }
  const uniquePart = crypto
    .randomBytes(2)
    .toString("hex")
    .toUpperCase()
    .slice(0, 3);

  const nextOrderId = `BZ${year}${String(nextOrderNo).padStart(
    3,
    "0"
  )}${uniquePart}`;

  // 3. Prepare order details
  const orderData = {
    userId: user_id,
    order_id: nextOrderId,
    order_no: nextOrderNo,
    order_datetime: orderDateTime,
    name: payment.buyer.name,
    email: payment.buyer.email,
    address: payment.shipping_address.address,
    state: '-',
    city: city || '-',
    area: area || '-',
    buildingName: buildingName || '-',
    floorNo: floorNo || '-',
    apartmentNo: apartmentNo || '-',
    landmark: landmark || '-',
    amount_subtotal: formatted_subtotal_amount,
    amount_total: formatted_total_amount,
    discount_amount: formattedDiscountAmount,
    phone: payment.buyer.phone,
    shipping: formattedshippingCost,
    txn_id: payment.id,
    status: "confirmed",
    payment_method: paymentMethod,
    payment_status: "paid",
    checkout_session_id: payment.id,
    saved_total: payment.meta.saved_total || 0,
    orderfrom: 'Website',

  };

  // 4. Create order in DB
  order = await Order.create(orderData);

  // Log order creation
  const user = await User.findById(user_id);
  await logActivity({
    platform: 'Website Backend',
    log_type: 'backend_activity',
    action: 'Order Creation',
    status: 'success',
    message: `Order ${nextOrderId} created successfully via Tabby`,
    user: user || { userId: user_id, name: payment.buyer.name, email: payment.buyer.email },
    details: { order_id: nextOrderId, payment_id: payment.id }
  });

  // 5. Create order details (line items)
  const orderDetails = cartData.map((item) => ({
    order_id: order._id,
    product_id: item.id,
    productId: item.product_id,
    product_name: item.name,
    product_image: item.image,
    variant_name: item.variant,
    amount: item.price,
    quantity: item.qty,
  }));
  await OrderDetail.insertMany(orderDetails);

  if (ENVIRONMENT === "true") {
    try {
      const results = await updateQuantities(cartData);
      console.log("Update results:", results);
      // Log inventory update success
      await logActivity({
        platform: 'Website Backend',
        log_type: 'backend_activity',
        action: 'Inventory Update',
        status: 'success',
        message: `Inventory updated for order ${nextOrderId}`,
        user: user || { userId: user_id, name: payment.buyer.name, email: payment.buyer.email },
        details: { order_id: nextOrderId, results }
      });
    } catch (inventoryError) {
      // Log inventory update failure
      await logActivity({
        platform: 'Website Backend',
        log_type: 'backend_activity',
        action: 'Inventory Update',
        status: 'failure',
        message: `Inventory update failed for order ${nextOrderId}`,
        user: user || { userId: user_id, name: payment.buyer.name, email: payment.buyer.email },
        details: { 
          order_id: nextOrderId, 
          error_details: inventoryError.message 
        }
      });
    }
  }

  const currentDate = new Date();
  const deliveryDate = new Date(
    currentDate.getTime() + 3 * 24 * 60 * 60 * 1000
  );
  const day = deliveryDate.getDate();
  const dayOfWeek = deliveryDate.toLocaleString("default", {
    weekday: "long",
  });
  const month = deliveryDate.toLocaleString("default", { month: "long" });
  const formattedDeliveryDate = `${dayOfWeek}, ${day} ${month}`;

  const adminSubject = `New Order Received: Order ID #${nextOrderId}`;
  const userSubject = `Order Confirmation: Order ID #${nextOrderId}`;
  const adminEmail = await getAdminEmail();

  const logoUrl = `${WEBURL}/images/logo.png`;

  const ccEmails = await getCcEmails();

  const name = payment.buyer.name;
  const userEmail = payment.buyer.email;
  const phone = payment.buyer.phone;

  function toCapitalCase(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const formattedPaymentMethod = toCapitalCase(paymentMethod);

  const purchaseDetails = cartData
    .map(
      (data) => `
                <tr style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.name}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.variant}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${data.qty}</td>
                    <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">AED ${data.price}</td>
                </tr>
                `
    )
    .join("");
  const html = `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>To be delivered before:</b> ${formattedDeliveryDate}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: bold; margin-top: 10px; margin-bottom: 6px;"><b>Payment Method:</b> ${formattedPaymentMethod}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>A new order has been placed on Bazaar.</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Below are the order details:</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Please review and process the order at your earliest convenience.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">Thank you for your continued support in ensuring excellent service for our customers.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead style="text-align: center;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                    ${purchaseDetails}
                                                </tbody>
                                                
                                              <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                    </tr>
                                                </thead>
                                                  <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_subtotal_amount}</b></th>
                                                    </tr>
                                                </thead>

                                                  
                                                 ${
                                                   discountAmount > 0
                                                     ? `
                                                 <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${formattedDiscountAmount}</b></th>
                                                    </tr>
                                                </thead>
                                                 `
                                                     : ""
                                                 } 
                                                 <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_total_amount}</b></th>
                                                    </tr>
                                                </thead>
                                              
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Customer Information</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${landmark || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${phone}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0; padding-left: 15px; padding-right: 15px;">&copy; <strong>bazaar-uae.com</strong> </p>
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

  const html1 = `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Order No:</b> ${nextOrderId}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Date & Time:</b> ${orderDateTime}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 10px; margin-bottom: 6px;"><b>Get it By:</b> ${formattedDeliveryDate}</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: bold; margin-top: 10px; margin-bottom: 6px;"><b>Payment Method:</b> ${formattedPaymentMethod}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:30px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>${name}</b>! Thank you for your order with Bazaar!</p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">We have received your order and are processing it. Below are the details of your purchase</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">If you have any questions about your order, feel free to reply to this email or contact our support team.</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 2px;">We appreciate your business and look forward to serving you again soon!</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead style="text-align: center;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Name</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Varient</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Quantity</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Item Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                    ${purchaseDetails}
                                                </tbody>
                                         
                                              
                                                       <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Shipping Charges</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formattedshippingCost}</b></th>
                                                    </tr>
                                                </thead>

                                              <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Sub Total</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_subtotal_amount}</b></th>
                                                    </tr>
                                                </thead>


                                                 ${
                                                   discountAmount > 0
                                                     ? `
                                                 <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Coupon Discount (10%)</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>- AED ${formattedDiscountAmount}</b></th>
                                                    </tr>
                                                </thead>
                                                 `
                                                     : ""
                                                 } <thead style="text-align: center; margin-top: 100px;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>Total</b></th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;"><b>AED ${formatted_total_amount}</b></th>
                                                    </tr>
                                                </thead>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                        
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 22px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 8px;">Billing Details</p>
                                            <br />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Name: ${name}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Customer Email: ${userEmail}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">City: ${city || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Area: ${area || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Building Name: ${buildingName || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Floor No: ${floorNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Apartment No: ${apartmentNo || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Landmark: ${landmark || '-'}</p>
                                            <p style="color: #455056; font-size: 13px; line-height: 15px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">Phone: ${phone}</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0; padding-left: 15px; padding-right: 15px;">&copy; <strong>bazaar-uae.com</strong> </p>
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

  // Send emails and log
  try {
    await sendEmail(adminEmail, adminSubject, html, ccEmails);
    await logActivity({
      platform: 'Website Backend',
      log_type: 'backend_activity',
      action: 'Email Sending',
      status: 'success',
      message: `Admin email sent for order ${nextOrderId}`,
      user: user || { userId: user_id, name, email: userEmail },
      details: { order_id: nextOrderId, recipient: adminEmail }
    });
  } catch (adminEmailError) {
    await logActivity({
      platform: 'Website Backend',
      log_type: 'backend_activity',
      action: 'Email Sending',
      status: 'failure',
      message: `Failed to send admin email for order ${nextOrderId}`,
      user: user || { userId: user_id, name, email: userEmail },
      details: { 
        order_id: nextOrderId, 
        recipient: adminEmail,
        error_details: adminEmailError.message 
      }
    });
  }

  try {
    await sendEmail(userEmail, userSubject, html1);
    await logActivity({
      platform: 'Website Backend',
      log_type: 'backend_activity',
      action: 'Email Sending',
      status: 'success',
      message: `User email sent for order ${nextOrderId}`,
      user: user || { userId: user_id, name, email: userEmail },
      details: { order_id: nextOrderId, recipient: userEmail }
    });
  } catch (userEmailError) {
    await logActivity({
      platform: 'Website Backend',
      log_type: 'backend_activity',
      action: 'Email Sending',
      status: 'failure',
      message: `Failed to send user email for order ${nextOrderId}`,
      user: user || { userId: user_id, name, email: userEmail },
      details: { 
        order_id: nextOrderId, 
        recipient: userEmail,
        error_details: userEmailError.message 
      }
    });
  }

  await clearUserCart(user_id);

  order.orderTracks.push({
    status: "Confirmed",
    dateTime: getUaeDateTime(),
    image: null,
  });

  await order.save();


  return order;
}

exports.verifyTabbyPayment = async (req, res) => {
  try {
    const { paymentId, bankPromoId } = req.body;
    const user_id = req.user._id;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }

    // --- Retrieve payment details from Tabby ---
    const paymentResp = await axios.get(
      `https://api.tabby.ai/api/v2/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` },
      }
    );
    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();

    // --- If AUTHORIZED, capture payment ---
    if (status === "AUTHORIZED") {
      const captureResp = await axios.post(
        `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
        { amount: payment.amount },
        { headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` } }
      );
      if (captureResp.data.status?.toUpperCase() !== "CLOSED") {
        return res.status(500).json({ error: "Capture failed" });
      }
    }

    // --- After capture or if already CLOSED, create order ---
    const finalStatus = status === "AUTHORIZED" ? "CLOSED" : status;
    if (finalStatus === "CLOSED") {

      const order = await createOrderAndSendEmails(payment, user_id);

      if (bankPromoId && user_id) {
        try {
          const promo = await BankPromoCode.findById(bankPromoId);
          if (promo) {
            const existing = await BankPromoCodeUsage.findOne({
              bankPromoCodeId: promo._id,
              userId: user_id,
            });
            if (!existing) {
              await BankPromoCodeUsage.create({
                bankPromoCodeId: promo._id,
                userId: user_id,
              });
              promo.usageCount = (promo.usageCount || 0) + 1;
              await promo.save();
              console.log(`Bank promo ${promo.code} usage recorded for user ${user_id} (Tabby).`);
            }
          }
        } catch (err) {
          console.error("Error recording bank promo usage (Tabby):", err);
        }
      }
      
      // Log order creation success
      const user = await User.findById(user_id);
      await logActivity({
        platform: 'Website Backend',
        log_type: 'backend_activity',
        action: 'Order Creation',
        status: 'success',
        message: `Order ${order.order_id} created successfully via Tabby`,
        user: user || { userId: user_id, name: order.name, email: order.email },
        details: { order_id: order.order_id, payment_id: paymentId }
      });
      
      // Calculate delivery date (3 days from now)
      const currentDate = new Date();
      const deliveryDate = new Date(
        currentDate.getTime() + 3 * 24 * 60 * 60 * 1000
      );
      const day = deliveryDate.getDate();
      const dayOfWeek = deliveryDate.toLocaleString("default", {
        weekday: "long",
      });
      const month = deliveryDate.toLocaleString("default", { month: "long" });
      const formattedDeliveryDate = `${dayOfWeek}, ${day} ${month}`;
      
      const name = order.name;
      const totalAmount = parseFloat(order.amount_total.replace(/,/g, ''));
      
      await Notification.create({
        userId: user_id,
        title: `Order No: ${order.order_id} Placed Successfully`,
        message: `Hi ${name}, your order of AED ${totalAmount.toFixed(2)} is confirmed. Expected by ${formattedDeliveryDate}. Thank you for shopping with Bazaar!`,
      });

      return res.json({
        message: "Order created successfully",
        orderId: order._id,
      });
    }

    return res.status(400).json({ error: `Payment status is ${status}` });
  } catch (error) {
    console.error("Tabby Payment error:", error);
    
    // Log Tabby payment verification failure
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

exports.checkout = async (req, res) => {
  try {
    const { name, email, address, cartData, shippingCost, currency } = req.body;

    const amount =
      cartData.reduce((total, item) => total + item.price * item.qty, 0) +
      shippingCost;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency || "usd",
      payment_method_types: ["card"],
    });

    const order = await Order.create({
      name,
      email,
      address,
      amount,
      shipping: shippingCost,
      payment_status: "pending",
      stripe_checkout_session_id: paymentIntent.id,
      orderfrom: 'Website',
    });

    const orderDetails = cartData.map((item) => ({
      order_id: order._id,
      product_id: item.id,
      product_name: item.name,
      variant_name: item.variant,
      amount: item.price,
      quantity: item.qty,
    }));

    await OrderDetail.insertMany(orderDetails);

    res.json({
      message: "Order created successfully",
      orderId: order._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

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

    const reviews = await Review.find();

    res.json({
      message: "Review created successfully",
      reviews: reviews,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.review = async (req, res) => {
  try {
    const reviews = await Review.find().populate('product_id');
 
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
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
 

exports.coupons = async (req, res) => {
  try {
    console.log("API - Coupons");
    const couponCount = await Coupon.countDocuments();

    console.log("Return - API - Coupons");
    return res.status(200).json({
      success: true,
      count: couponCount, // Return the count
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching coupon count.",
    });
  }
};

exports.checkCouponCode = async (req, res) => {
  const { couponCode } = req.body;

  if (!couponCode || !String(couponCode).trim()) {
    return res.status(400).json({ message: "Coupon code is required." });
  }

  const codeTrimmed = String(couponCode).trim();

  if (codeTrimmed === 'UAE10') {
    const couponDetails = await fetchCouponDetails("1991824943058366464");
    if (!couponDetails) {
      return res.status(404).json({ message: "Coupon details not found." });
    }
    const { start_time, end_time, status } = couponDetails;
    const currentDubaiTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })
    );
    const startTime = new Date(start_time);
    const endTime = new Date(end_time);
    if (status !== "active") {
      return res.status(400).json({ message: "This promotion is not active." });
    }
    if (currentDubaiTime < startTime) {
      return res.status(400).json({ message: "Promotion has not started yet." });
    }
    if (currentDubaiTime > endTime) {
      return res.status(400).json({ message: "Promotion has expired." });
    }
    return res.status(200).json({
      message: "Coupon code is valid.",
      type: "coupon",
      discountPercent: 10,
    });
  }

  try {
    const coupon = await Coupon.findOne({
      coupon: codeTrimmed,
      status: "unused",
    });
    if (coupon) {
      return res.status(200).json({
        message: "Coupon code is valid.",
        type: "coupon",
        discountPercent: 10,
      });
    }

    const promoCode = await BankPromoCode.findOne({
      code: codeTrimmed.toUpperCase(),
      active: true,
    }).lean();
    if (promoCode) {
      const now = new Date();
      const expiry = new Date(promoCode.expiryDate);
      if (expiry < now) {
        return res.status(400).json({ message: "This promo code has expired." });
      }
      if (promoCode.singleUsePerCustomer && req.user) {
        const alreadyUsed = await BankPromoCodeUsage.findOne({
          bankPromoCodeId: promoCode._id,
          userId: req.user._id,
        });
        if (alreadyUsed) {
          return res.status(400).json({
            message: "You have already used this promo code. It is limited to one use per customer.",
          });
        }
      }
      return res.status(200).json({
        message: `Promo code applied: ${promoCode.discountPercent}% off${promoCode.capAED ? ` (max ${promoCode.capAED} AED)` : ""}.`,
        type: "promo",
        discountPercent: promoCode.discountPercent,
        capAED: promoCode.capAED || null,
        bankPromoId: promoCode._id.toString(),
      });
    }

    return res.status(404).json({
      message: "Coupon/promo code is not valid or has already been used.",
    });
  } catch (error) {
    console.error("Error checking coupon code:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.redeemCoupon = async (req, res) => {
  const { couponCode, mobileNumber } = req.body; // Get the coupon code and mobile number from the request body

  if (!couponCode) {
    return res.status(400).json({ message: "Coupon code is required." });
  }

  if (couponCode === 'UAE10') {
    const couponDetails = await fetchCouponDetails("1991824943058366464");

    if (!couponDetails) {
      return res.status(404).json({ message: "Coupon details not found." });
    }

    const { start_time, end_time, status } = couponDetails;

    // Convert CURRENT Dubai time
    const currentDubaiTime = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })
    );

    // Convert start & end to real Date objects
    const startTime = new Date(start_time);
    const endTime = new Date(end_time);

    // Status check
    if (status !== "active") {
      return res.status(400).json({ message: "This promotion is not active." });
    }

    // Time checks
    if (currentDubaiTime < startTime) {
      return res.status(400).json({ message: "Promotion has not started yet." });
    }

    if (currentDubaiTime > endTime) {
      return res.status(400).json({ message: "Promotion has expired." });
    }

    return res.status(200).json({ message: "Coupon code is valid." });
  }

  if (!couponCode || !mobileNumber) {
    return res
      .status(400)
      .json({ message: "Coupon code and mobile number are required." });
  }

  try {
    // Check if the coupon code exists and is associated with the provided mobile number
    const coupon = await Coupon.findOne({
      coupon: couponCode,
      phone: mobileNumber,
    });

    if (coupon) {
      // Coupon code is valid and associated with the mobile number
      return res.status(200).json({
        message: "Coupon code is valid. Please proceed with the payment.",
      });
    } else {
      // Coupon code is not valid or not associated with the mobile number
      return res.status(404).json({
        message:
          "Coupon code is not valid or not associated with this mobile number.",
      });
    }
  } catch (error) {
    console.error("Error redeeming coupon:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

exports.fetchAllProducts = async (req, res) => {
  try {
    console.log("API - Fetch All Products");
    // let allProducts = await fetchAndCacheProducts();
    // allProducts = await filterAndCacheProductsByInventory(allProducts);
    let allProducts = await Product.find();
    allProducts = allProducts.filter((product) => product.status === true);

    console.log("Return - API - Fetch All Products");
    return res.json(allProducts);
  } catch (error) {
    console.error("Error fetching data from API:", error.message);
    console.error(
      "Error details:",
      error.response ? error.response.data : error
    );
    res.status(500).send("Internal Server Error");
  }
};

exports.fetchHomeProducts = async (req, res) => {
  try {
    console.log("API - Fetch Home Products");
    const categories = await fetchAndCacheCategories();
    // const categories = await Category.find();
    let products = await Product.find();
    products = products.filter((product) => product.status === true);
    // let products = await fetchAndCacheProducts();
    // products = await filterAndCacheProductsByInventory(products);
    const sortedCategories = {};
    const categoryLookup = Object.fromEntries(
      categories.map((category) => [category.id, category.name])
    );

    categories.forEach((category) => {
      if (category.parent_category_id === null) {
        sortedCategories[category.name] = {
          id: category.id,
          name: category.name,
          sub_categories: [],
        };
      } else {
        const rootName = categoryLookup[category.root_category_id];
        if (rootName && sortedCategories[rootName]) {
          sortedCategories[rootName].sub_categories.push({
            id: category.id,
            name: category.name,
          });
        }
      }
    });

    const result = {};
    const categoriesArrays = {
      Electronics: "eb38712b-3652-4969-b34b-4389e770de4c",
      Home: "0aa39cca-853e-46cc-a7a0-2cddcc11cc70",
      "Home Improvement": "7bf90217-e79a-46ec-9aa3-5231071b487f",
      "Sports, Fitness & Outdoors": "5ce3bbd8-28cf-4643-b871-1f28a0eb216c",
      Toys: "ada654b6-9fb7-4c6f-bf40-1bae7c6dcbc6",
    };

    for (const [key, categoryId] of Object.entries(categoriesArrays)) {
      if (sortedCategories[key]) {
        const subcategories = sortedCategories[key].sub_categories;
        const subcategoriesWithProductCount = [];
        const getRandomItems = (array, count) => {
          const shuffled = array.sort(() => 0.5 - Math.random());
          return shuffled.slice(0, count);
        };

        subcategories.forEach((subcategory) => {
          const subcategoryProducts = products.filter(
            (product) => product.product.product_type_id === subcategory.id
          );
          subcategoriesWithProductCount.push({
            id: subcategory.id,
            name: subcategory.name,
            product_count: subcategoryProducts.length,
            products: getRandomItems(subcategoryProducts, 24),
          });
        });

        subcategoriesWithProductCount.sort(
          (a, b) => b.product_count - a.product_count
        );
        result[key] = {
          sub_categories: subcategoriesWithProductCount.slice(0, 4),
        };
      }
    }

    const uncategorizedProducts = products.filter(
      (product) => product.product.product_type_id === null
    );
    if (uncategorizedProducts.length > 0) {
      result["Uncategorized"] = {
        sub_categories: [
          {
            id: "null-subcategory-id",
            name: "Uncategorized",
            products: uncategorizedProducts.slice(0, 24),
          },
        ],
      };
    }

    console.log("Return - API - Fetch Home Products");
    res.json({
      result,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch home products" });
  }
};

exports.searchSingleProduct = async (req, res) => {
  try {
    const { item_name } = req.body;

    const productName = item_name.toLowerCase();
    const products = await Product.find({
      "product.name": { $regex: productName, $options: "i" },
    });
    if (products.length === 0) {
      return res
        .status(404)
        .json({ message: `Product not found with the name "${item_name}"` });
    }
    let filteredProducts = products.map((product) => product);
    filteredProducts = filteredProducts.filter(
      (product) => product.status === true
    );
    res.json({ filteredProducts });
  } catch (error) {
    console.error("Error searching for product:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// exports.searchProduct = async (req, res) => {
//   const { item_name, category_id } = req.body;

//   try {
//     if (!item_name || item_name.length < 3) {
//       return res.status(400).json({
//         message: "Search term must be at least 3 characters long",
//         filteredProducts: [],
//         filteredProductsCount: 0,
//         noResult: true,
//         suggestion: null,
//       });
//     }

//     const suggestedWord = await checkSpelling(item_name);

//     const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//     const searchTerms = item_name.trim().split(/\s+/).map(escapeRegex);

//     // const phraseRegex = new RegExp(`\\b${escapeRegex(item_name.trim())}\\b`, "i");
//     const phraseRegex = new RegExp(
//       escapeRegex(item_name.trim()).replace(/\s+/g, "[\\s,.-]*"),
//       "i"
//     );

//     let query = {
//       $and: [
//         {
//           $or: [
//             { "product.name": { $regex: phraseRegex } },
//             { "product.description": { $regex: phraseRegex } },
//           ],
//         },
//         {
//           $and: searchTerms.map((term) => ({
//             $or: [
//               { "product.name": { $regex: term, $options: "i" } },
//               { "product.description": { $regex: term, $options: "i" } },
//             ],
//           })),
//         },
//         { totalQty: { $gt: 0 } },
//         { status: true },
//       ],
//     };

//     if (category_id) {
//       query["product.product_type_id"] = category_id;
//     }

//     let filteredProducts = await Product.find(query).lean();

//     const noResult = filteredProducts.length === 0;

//     if (noResult) {
//       return res.json({
//         noResult: true,
//         filteredProductsCount: 0,
//         filteredProducts: [],
//         // suggestion: suggestedWord,
//       });
//     }

//     return res.json({
//       noResult: false,
//       filteredProductsCount: filteredProducts.length,
//       filteredProducts,
//       // suggestion: suggestedWord,
//     });
//   } catch (error) {
//     console.error("❌ Error processing the request:", error);
//     res.status(500).json({
//       error: "An error occurred while processing the request",
//       suggestion: null,
//     });
//   }
// };

// Cached version of checkSpelling to avoid repeated API calls
// This function uses caching to optimize third-party API calls that can take up to 1 minute

exports.searchProduct = async (req, res) => {
  const { item_name, category_id } = req.body;

  try {
    if (!item_name || item_name.length < 3) {
      return res.status(400).json({
        message: "Search term must be at least 3 characters long",
        filteredProducts: [],
        filteredProductsCount: 0,
        noResult: true,
      });
    }

    let searchStage = {
      $search: {
        index: "product_search",
        compound: {
          should: [
            {
              text: {
                query: item_name,
                path: "product.name",
                score: { boost: { value: 5 } },
                fuzzy: { maxEdits: 2, prefixLength: 1 }
              }
            },
            {
              autocomplete: {
                query: item_name,
                path: "product.name",
                score: { boost: { value: 3 } },
                fuzzy: { maxEdits: 1 }
              }
            },
            {
              text: {
                query: item_name,
                path: "product.description",
                score: { boost: { value: 1 } },
                fuzzy: { maxEdits: 2 }
              }
            }
          ],
          must: [
            { equals: { path: "status", value: true } },
            { range: { path: "totalQty", gt: 0 } }
          ],
          minimumShouldMatch: 1
        }
      }
    };

    if (category_id) {
      searchStage.$search.compound.must.push({
        equals: { path: "product.product_type_id", value: category_id }
      });
    }

    const pipeline = [
      searchStage,
      { $addFields: { score: { $meta: "searchScore" } } },
      // Filter out products with no images
      {
        $match: {
          $expr: {
            $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
          }
        }
      },
      { $sort: { score: -1 } },
      { $limit: 100 }
    ];

    let filteredProducts = [];
    try {
      filteredProducts = await Product.aggregate(pipeline);
      
      // If Atlas Search returns no results, fall back to regex search
      if (filteredProducts.length === 0) {
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const searchTerms = item_name.trim().split(/\s+/).map(escapeRegex);
        
        let fallbackQuery = {
          $and: [
            {
              $and: searchTerms.map((term) => ({
                $or: [
                  { "product.name": { $regex: term, $options: "i" } },
                  { "product.description": { $regex: term, $options: "i" } },
                ],
              })),
            },
          ],
        };

        if (category_id) {
          fallbackQuery["product.product_type_id"] = category_id;
        }

        const fallbackProducts = await Product.find(fallbackQuery).lean().limit(100);
        
        // Filter by status, totalQty, and images
        filteredProducts = fallbackProducts.filter(p => 
          p.status === true && 
          (p.totalQty === undefined || p.totalQty > 0) &&
          p.product?.images && 
          Array.isArray(p.product.images) && 
          p.product.images.length > 0
        );
      }
    } catch (aggError) {
      // If Atlas Search fails (missing index), fall back to regex search
      if (aggError.code === 40324 || aggError.message.includes('$search') || aggError.message.includes('index')) {
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const searchTerms = item_name.trim().split(/\s+/).map(escapeRegex);
        
        let fallbackQuery = {
          $and: [
            {
              $and: searchTerms.map((term) => ({
                $or: [
                  { "product.name": { $regex: term, $options: "i" } },
                  { "product.description": { $regex: term, $options: "i" } },
                ],
              })),
            },
          ],
        };

        if (category_id) {
          fallbackQuery["product.product_type_id"] = category_id;
        }

        const fallbackProducts = await Product.find(fallbackQuery).lean().limit(100);
        filteredProducts = fallbackProducts.filter(p => 
          p.status === true && 
          (p.totalQty === undefined || p.totalQty > 0) &&
          p.product?.images && 
          Array.isArray(p.product.images) && 
          p.product.images.length > 0
        );
      } else {
        throw aggError;
      }
    }

    filteredProducts = filteredProducts.filter(product => 
      product.product?.images && 
      Array.isArray(product.product.images) && 
      product.product.images.length > 0
    );

    const searchWords = item_name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (searchWords.length > 1) {
      filteredProducts = filteredProducts.filter(product => {
        const text = `${product.product?.name || ''} ${product.product?.description || ''}`.toLowerCase();
        const matched = searchWords.filter(word => text.includes(word)).length;
        return matched >= Math.ceil(searchWords.length * 0.7);
      });
    }


    return res.json({
      noResult: filteredProducts.length === 0,

      filteredProductsCount: filteredProducts.length,
      filteredProducts,
    });
  } catch (error) {
    console.error("❌ Error processing search request:", error);

    if (error.code === 40324 || error.message.includes('$search')) {
      return res.status(500).json({
        error: "Search index not configured",
      });
    }
    
    res.status(500).json({
      error: "An error occurred while processing the request",
    });
  }
};


const checkSpelling = async (word) => {
  if (!word || typeof word !== "string") {
    return null;
  }

  // Normalize the word for cache key (lowercase, trimmed)
  const normalizedWord = word.trim().toLowerCase();
  const cacheKey = `spelling:${normalizedWord}`;

  // Check cache first - this avoids the slow API call for repeated searches
  const cachedResult = spellingCache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  try {
    let suggestion = null;

    // OPTION 1: Using local Typo.js dictionary (current implementation)
    if (!dictionary.check(normalizedWord)) {
      const suggestions = dictionary.suggest(normalizedWord);
      suggestion = suggestions.length > 0 ? suggestions[0] : null;
    }

    // OPTION 2: If using a third-party API, replace the above with:
    // const response = await axios.post('YOUR_API_ENDPOINT', { word: normalizedWord });
    // suggestion = response.data.suggestion || null;

    // Cache the result (null is also cached to avoid repeated checks for correct words)
    // Cache TTL is 7 days (604800 seconds) since spelling suggestions don't change
    spellingCache.set(cacheKey, suggestion);
    return suggestion;
  } catch (error) {
    console.error("Error in checkSpelling:", error);
    // On error, return null and don't cache to allow retry on next request
    return null;
  }
};

// Function to check spelling using Typo.js

exports.contactUs = [
  uploadContactUsFile.single("file"),
  async (req, res) => {
    try {
      const { email, name, message, phone, recaptchaToken } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required123" });
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

      // Verify reCAPTCHA token with Google
      const RECAPTCHA_API_KEY = process.env.RECAPTCHA_API_KEY;
      const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

      if (!RECAPTCHA_API_KEY || !PROJECT_ID) {
        console.error("reCAPTCHA Enterprise credentials are not configured");
        return res.status(500).json({ message: "Server configuration error" });
      }

      const recaptchaResponse = await axios.post(
        `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${RECAPTCHA_API_KEY}`,
        {
          event: {
            token: recaptchaToken,
            expectedAction: "contact_form",
            siteKey: process.env.RECAPTCHA_SITE_KEY, // Optional but recommended
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
        console.error(
          "reCAPTCHA token is invalid:",
          recaptchaResponse.data.tokenProperties?.invalidReason
        );
        return res
          .status(403)
          .json({ message: "Security verification failed. Please try again." });
      }

      if (action !== "contact_form") {
        console.error("Invalid reCAPTCHA action:", action);
        return res.status(403).json({ message: "Invalid verification action" });
      }

      const MINIMUM_SCORE = 0.5; // Adjust threshold as needed
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

exports.newsLetter = async (req, res) => {
  try {
    const { email, recaptchaToken } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Validate reCAPTCHA token
    if (!recaptchaToken) {
      return res
        .status(400)
        .json({ message: "reCAPTCHA verification is required" });
    }

    // Verify reCAPTCHA token with Google

    const RECAPTCHA_API_KEY = process.env.RECAPTCHA_API_KEY;
    const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

    if (!RECAPTCHA_API_KEY || !PROJECT_ID) {
      console.error("reCAPTCHA Enterprise credentials are not configured");
      return res.status(500).json({ message: "Server configuration error" });
    }

    try {
      const recaptchaResponse = await axios.post(
        `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${RECAPTCHA_API_KEY}`,
        {
          event: {
            token: recaptchaToken,
            expectedAction: "newsletter_subscribe",
            siteKey: process.env.RECAPTCHA_SITE_KEY, // Optional but recommended
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("reCAPTCHA Enterprise verification result:", {
        tokenValid: recaptchaResponse.data.tokenProperties?.valid,
        score: recaptchaResponse.data.riskAnalysis?.score,
        action: recaptchaResponse.data.tokenProperties?.action,
        reasons: recaptchaResponse.data.riskAnalysis?.reasons,
      });

      // Check if token is valid
      if (!recaptchaResponse.data.tokenProperties?.valid) {
        console.error(
          "reCAPTCHA token is invalid:",
          recaptchaResponse.data.tokenProperties?.invalidReason
        );
        return res.status(403).json({
          message: "Security verification failed. Please try again.",
        });
      }

      // Check if the action matches
      if (
        recaptchaResponse.data.tokenProperties?.action !==
        "newsletter_subscribe"
      ) {
        console.error(
          "Invalid reCAPTCHA action:",
          recaptchaResponse.data.tokenProperties?.action
        );
        return res.status(403).json({
          message: "Invalid verification action",
        });
      }

      // Check the risk score (0.0 to 1.0, where 1.0 is very likely a good interaction)
      const score = recaptchaResponse.data.riskAnalysis?.score || 0;
      const MINIMUM_SCORE = 0.5; // Adjust based on your needs (0.3-0.7 is typical)

      if (score < MINIMUM_SCORE) {
        console.warn(
          `Low reCAPTCHA score detected: ${score} (minimum: ${MINIMUM_SCORE})`
        );
        return res.status(403).json({
          message: "Suspicious activity detected. Please try again later.",
        });
      }

      console.log(`✓ reCAPTCHA verification passed with score: ${score}`);
    } catch (recaptchaError) {
      console.error(
        "Error verifying reCAPTCHA:",
        recaptchaError.response?.data || recaptchaError.message
      );
      return res.status(500).json({
        message: "Failed to verify security check. Please try again.",
      });
    }

    const existingSubscription = await NewsLetter.findOne({ email });

    if (existingSubscription) {
      return res
        .status(400)
        .json({ message: "You are already subscribed to the newsletter" });
    }

    const newNewsLetter = new NewsLetter({
      email,
    });

    const adminEmail = await getAdminEmail();
    const logoUrl = `${WEBURL}/images/logo.png`;

    const subject = `Welcome to Bazaar Newsletter - Subscription Successful!`;
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
                                                    <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"
                                                        style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; -webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                        <tr>
                                                            <td style="height:40px;">&nbsp;</td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding:0 35px;">
                                                                <p>Thank you for subscribing to the Bazaar newsletter! We're delighted to have you join our community. You'll receive updates, special offers, and cheesy tips directly in your inbox. Stay tuned for the latest news and some cheesy goodness coming your way!</p>
                                                                <p>If you have any questions, feel free to reach out to us. We're here to help!</p>
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

    const adminSubject = "New Newsletter Subscription - Bazaar";
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
                                                                            A new user has subscribed to the Bazaar newsletter
                                                                        </p>
                                                                        <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Email <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${email}</p></p>
                                                                        <span style="display:inline-block; vertical-align:middle; margin:16px 0 26px; border-bottom:1px solid #cecece; width:100%;"></span>
                                                                        <br>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">Please check the admin dashboard for more details about the subscriber.</p>
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

    await newNewsLetter.save();

    res.status(201).json({
      message: `Thank you for subscribing to the Bazaar newsletter!.`,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllNewsLetters = async (req, res) => {
  try {
    const newsLetters = await NewsLetter.find();
    res.json(newsLetters);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.editorBodyImagesUpload = [
  editorBodyImagesUpload.fields([{ name: "file", maxCount: 1 }]),
  async (req, res) => {
    try {
      const file = req.files?.file?.[0];
      if (!file) {
        return res.status(400).json({ message: "Missing required file" });
      }
      const fileUrl = `${BACKEND_URL}/uploads/EditorBodyImages/${file.filename}`;

      res.status(200).json({
        uploaded: 1,
        url: fileUrl,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
];

// Helper to extract filename from URL
const extractFileNameFromUrl = (url) => {
  try {
    const parsedUrl = new URL(url);
    return path.basename(parsedUrl.pathname);
  } catch {
    return null;
  }
};

exports.deleteFileByUrl = async (req, res) => {
  const imageUrl = req.body.imageUrl;
  try {
    const fileName = extractFileNameFromUrl(imageUrl);
    if (!fileName) {
      throw new Error("Invalid URL: No filename found");
    }

    // Adjust this path to your actual uploads directory
    const uploadsDir = path.join(__dirname, "../uploads/EditorBodyImages");
    const filePath = path.join(uploadsDir, fileName);

    // Delete the file if it exists
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return res
        .status(200)
        .json({ success: true, message: "File deleted successfully" });
    } else {
      return res
        .status(404)
        .json({ success: false, message: "File not found on server" });
    }
  } catch (error) {
    console.error("Error deleting file:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.sendBulkEmails = function (req, res) {
  const emailData = req.body;
  const { to, cc, bcc, subject, body } = emailData;

  // Validate required fields
  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Create a transporter using SMTP
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Combine all recipients
  const allRecipients = [...to, ...(cc || []), ...(bcc || [])];

  // Use async.eachLimit to control concurrency
  async.eachLimit(
    allRecipients,
    10,
    (recipient, callback) => {
      const mailOptions = {
        from: process.env.EMAIL_USERNAME,
        to: recipient,
        cc: cc,
        bcc: bcc,
        subject: subject,
        html: body,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error(`Error sending email to ${recipient}:`, error);
        } else {
          console.log(`Email sent to ${recipient}:`, info.response);
        }
        callback();
      });
    },
    (err) => {
      if (err) {
        console.error("Error in bulk email sending:", err);
        res.status(500).json({ error: "Failed to send emails" });
      } else {
        console.log("Bulk email sending completed");
        res.status(200).json({ message: "Emails sent successfully" });
      }
      transporter.close();
    }
  );
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
    console.error("Error fetching product details:", error.message);
    return res.status(500).json({ error: "Failed to fetch product details" });
  }
};

exports.randomProducts = async (req, res) => {
  const { id } = req.params;
  try {
    const categoryResponse = await axios.get(
      `https://bazaargeneraltrading.retail.lightspeed.app/api/2.0/product_types/${id}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );
    const categoryDetails = categoryResponse.data;
    let categories = null;
    let categoryId = null;
    if (categoryDetails.data) {
      const categoryPath = categoryDetails.data.category_path;
      categories = categoryPath.map((category) => ({
        id: category.id,
        name: category.name,
      }));
      categoryId = categoryDetails.data.id;
    }

    // let allProducts = await fetchAndCacheProducts();
    // allProducts = await filterAndCacheProductsByInventory(allProducts);
    let allProducts = await Product.find();
    allProducts = allProducts.filter((product) => product.status === true);
    const subcategoryProducts = allProducts.filter(
      (p) => p.product.product_type_id === id
    );

    const filteredProducts = subcategoryProducts.filter((product) => {
      // Check if the product has variantsData and if the length is greater than 0
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
    const randomProducts = getRandomItems(filteredProducts, 10);
    return res.json({ randomProducts });
  } catch (error) {
    console.error("Error fetching product details:", error.message);
    return res.status(500).json({ error: "Failed to fetch product details" });
  }
};

exports.similarProducts = async (req, res) => {
  const { id } = req.params;
  const productId = req.headers["product-id"] || req.headers.productid;
  
  try {
    // Validate id parameter
    if (!id || id.trim() === "") {
      return res.status(400).json({ error: "Product type ID is required" });
    }

    // Escape special regex characters in the id to prevent regex injection
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    
    // Find products with matching product_type_id using RegExp (case-insensitive)
    const products = await Product.find({
      status: true,
      "product.product_type_id": { $regex: escapedId, $options: "i" },
      variantsData: { $exists: true, $ne: [] }
    });

    // Filter products that have variantsData with length > 0 and images
    // Also exclude the current product if productId is provided
    const filteredProducts = products.filter((product) => {
      // Exclude the current product if productId is provided
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

    // Get random 20 items
    const getRandomItems = (array, count) => {
      const shuffled = array.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    };
    
    const similarProducts = getRandomItems(filteredProducts, 20);
    return res.json({ similarProducts });
  } catch (error) {
    console.error("Error fetching similar products:", error.message);
    return res.status(500).json({ error: "Failed to fetch similar products" });
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user_id = req.user._id;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name and phone are required.",
      });
    }

    const existingUser = await Coupon.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: "Phone already exists" });
    }

    // 1. Get total coupon limit from CouponsCount
    const couponsCountDoc = await CouponsCount.findOne();
    const totalCouponLimit = couponsCountDoc.count;

    // 2. Get current coupon count
    const currentCouponCount = await Coupon.countDocuments();

    // 3. Calculate remaining coupons
    const remainingCoupons = totalCouponLimit - currentCouponCount;

    if (remainingCoupons <= 0) {
      return res.status(400).json({
        success: false,
        message: "All coupons have been claimed. No more coupons available.",
      });
    }

    const lastCoupon = await Coupon.findOne().sort({ id: -1 }).exec(); // Find last coupon by `id`
    const nextId =
      lastCoupon && typeof lastCoupon.id === "number" ? lastCoupon.id + 1 : 1; // Start at 1 if no records exist or `id` is invalid

    const couponCode = await generateCouponCode();

    const discount = 10; // Example discount value
    const validFrom = new Date();
    const validUntil = new Date(validFrom);
    validUntil.setMonth(validFrom.getMonth() + 1); // Coupon valid for one month

    const newCoupon = new Coupon({
      id: nextId,
      coupon: couponCode,
      name,
      phone,
      user_id,
      discount,
      validFrom,
      validUntil,
      isActive: true, // Default active status
    });

    await newCoupon.save();


    const logoUrl = `${WEBURL}/images/logo.png`;

    // 4. Send email to admin if remaining coupons == 10
    if (remainingCoupons <= 10) {
      const logoUrl = `${WEBURL}/images/logo.png`;
      const adminEmail = await getAdminEmail();
      const alertSubject = "ALERT: Only 10 Coupons Remaining - Bazaar";
      const alertHtml = `
    <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;" leftmargin="0">
      <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="font-family: 'Open Sans', sans-serif;">
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
                    style="max-width:670px; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                    <tr>
                      <td style="height:40px;">&nbsp;</td>
                    </tr>
                    <tr>
                      <td style="padding:0 35px;">
                        <br>
                        <h6 style="color:#d32f2f; font-weight:700; margin:0;font-size:20px;font-family:'Rubik',sans-serif;"> <b>ALERT: Only Less than 10 Coupons Remaining</b></h6>
                        <p style="color:#455056; font-size:16px; margin: 10px 0 0 0; font-weight: 500;">
                          Dear Bazaar Team,<br>
                          This is an automated alert to inform you that only <b>less than 10 coupons</b> are remaining in your system.<br>
                          <br>
                          <b>Total Allowed Coupons:</b> ${totalCouponLimit}<br>
                          <b>Coupons Issued:</b> ${currentCouponCount}<br>
                          <b>Coupons Remaining:</b> ${remainingCoupons}
                        </p>
                        <br>
                        <p style="color:#d32f2f; font-size:16px; font-weight:600;">Please take necessary action to replenish or update your coupon settings.</p>
                        <br>
                        <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b>Thank You,</b></h6>
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
                  <p style="font-size:14px; color:rgba(69, 80, 86, 0.74); line-height:18px; margin:0;">&copy; <strong>bazaar-uae.com</strong></p>
                </td>
              </tr>
              <tr>
                <td style="height:80px;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table> 
    </body>
  `;
      const ccEmail = await getCcEmails();
      await sendEmail(adminEmail, alertSubject, alertHtml, ccEmail);
    }

    const adminEmail = await getAdminEmail();
    const adminSubject = "New Coupon Code Generated - Bazaar";
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
                                                                            We are pleased to inform you that we have generated a coupon code for a new customer and wish to provide you the details for your attention.
                                                                        </p>
                                                                        <br>
                                                                        <br>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Name <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${name}</p></p>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Phone Number <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${phone}</p></p>
                                                                        <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 600; margin-top: 0px; margin-bottom: initial;"> Coupon Code <p style="color:#455056; font-size:16px;line-height:20px; font-weight: 500; margin-top: 5px;">${couponCode}</p></p>
                                                                        <br>
                                                                        <br>
                                                                        <h6 style="color:#1e1e2d; font-weight:500; margin:0;font-size:18px;font-family:'Rubik',sans-serif;"> <b> Thank You,</b></h6>
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

    await sendEmail(adminEmail, adminSubject, adminHtml);

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully.",
      coupon: newCoupon,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Error creating coupon.",
    });
  }
};

exports.allCategories = async (req, res) => {
  try {
    console.log("API - All Categories");
    // const categories = await fetchAndCacheCategories();
    // let allProducts = await fetchAndCacheProducts();
    // allProducts = await filterAndCacheProductsByInventory(allProducts);

    const categories = await Category.find();
    let allProducts = await Product.find();
    allProducts = allProducts.filter((product) => product.status === true);

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

    console.log("Return - API - All Categories");
    res.json({
      side_bar_categories: finalCategoryTree,
      search_categoriesList: flatCategoryList,
    });
  } catch (error) {
    console.error("Error fetching categories or products:", error);
    res.status(500).json({ error: "Failed to fetch categories or products" });
  }
};

exports.categoriesProduct = async (req, res) => {
  const { id } = req.params;

  try {
    let categories = await fetchAndCacheCategories();
    const categoriesTypes = await fetchCategoriesType(id);
    // let products = await fetchAndCacheProducts();
    // products = await filterAndCacheProductsByInventory(products);

    // const categories = await Category.find();
    let products = await Product.find();
    products = products.filter((product) => product.status === true);

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

    const filteredProducts = products.filter(
      (product) =>
        uniqueCategoryIds.includes(product.product.product_type_id) &&
        product.totalQty > 0 &&
        product.product?.images &&
        Array.isArray(product.product.images) &&
        product.product.images.length > 0
    );

    const filteredProductsCount = filteredProducts.length;

    res.json({
      categories,
      categoryId: id,
      filteredProductsCount,
      filteredProducts,
    });
  } catch (error) {
    console.error("Error fetching categories or products:", error);
    res.status(500).json({ error: "Failed to fetch categories or products" });
  }
};

exports.subCategoriesProduct = async (req, res) => {
  const { id } = req.params;

  try {
    let categories = await fetchAndCacheCategories();
    const categoriesTypes = await fetchCategoriesType(id);
    // let products = await fetchAndCacheProducts();
    // products = await filterAndCacheProductsByInventory(products);

    // const categories = await Category.find();
    let products = await Product.find();
    products = products.filter((product) => product.status === true);

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

    // const filteredProducts = products.filter((product) =>
    //   uniqueCategoryIds.includes(product.product.product_type_id)
    // );

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

    res.json({
      categories,
      categoryId: id,
      filteredProductsCount,
      filteredProducts,
    });
  } catch (error) {
    console.error("Error fetching categories or products:", error);
    res.status(500).json({ error: "Failed to fetch categories or products" });
  }
};

exports.subSubCategoriesProduct = async (req, res) => {
  const { id } = req.params;

  try {
    let categories = [];
    // let products = await fetchAndCacheProducts();
    let products = await Product.find();
    products = products.filter((product) => product.status === true);
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

    res.json({
      categories,
      categoryId: id,
      filteredProductsCount,
      filteredProducts,
    });
  } catch (error) {
    console.error("Error fetching categories or products:", error);
    res.status(500).json({ error: "Failed to fetch categories or products" });
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
      console.log(`Updated details for product ID: ${product.id}`);
      return res.json({
        message: `Product details updated successfully.`,
        product: updatedEntry,
      });
    } else {
      console.log(`Product ID: ${product.id} does not exist.`);
      return res
        .status(404)
        .json({ error: `Product not found in the database.` });
    }
  } catch (error) {
    console.error("Error updating product details:", error.message);
    return res.status(500).json({ error: "Failed to update product details." });
  }
};

function isClientConnected(res) {
  return !res.headersSent && res.socket && res.socket.writable;
}

exports.getIdss = async (req, res) => {
  let isProcessing = true;

  // Set up a listener for client disconnection
  req.on("close", () => {
    isProcessing = false;
    console.log("Client disconnected, stopping processing");
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
    console.error("Error fetching and storing product IDs:", error.message);
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
        console.log(`Added new Product ID: ${id}`);
      }
      await storeProductDetails(missingProductIds, res);
    } else {
      console.log("No missing product IDs found.");
      return res.status(200).json({
        message: "All product IDs are already in the database.",
      });
    }
  } catch (error) {
    console.error("Error fetching and storing product IDs:", error.message);
    return res.status(500).json({
      message: "Failed to process product IDs",
      error: error.message,
    });
  }
};

exports.products = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 54;
  const filter = req.query.filter;
  const minPrice = parseFloat(req.query.minPrice);
  const maxPrice = parseFloat(req.query.maxPrice);

  let matchStage = {
    totalQty: { $gt: 0 },
    $or: [{ status: { $exists: false } }, { status: true }],
  };

  if (!isNaN(minPrice) && !isNaN(maxPrice)) {
    matchStage.discountedPrice = {
      $gte: minPrice,
      $lte: maxPrice,
      $gt: 0
    };
  }

  // Build aggregation pipeline
  let aggregationPipeline = [];

  // Match initial query
  aggregationPipeline.push({ $match: matchStage });

  // Filter products that have images (product.images length > 0)
  aggregationPipeline.push({
    $match: {
      $expr: {
        $gt: [{ $size: { $ifNull: ["$product.images", []] } }, 0]
      }
    }
  });

  // Add color filter if exists
  if (filter && filter.length > 0 && filter !== "[]") {
    try {
      const filterWords = JSON.parse(filter);
      if (filterWords.length > 0) {
        const words = filterWords.map((word) => word.toLowerCase());

        aggregationPipeline.push({
          $match: {
            "variantsData.sku": {
              $regex: new RegExp(`^(${words.join("|")}) - .*`, "i"),
            },
          },
        });
      }
    } catch (error) {
      console.error("Error parsing filter:", error);
    }

  }

  try {
    // Get total count
    const countPipeline = [...aggregationPipeline, { $count: "total" }];
    const countResult = await Product.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    // Get paginated products with randomization
    const productsPipeline = [
      ...aggregationPipeline,
      { $addFields: { randomSort: { $rand: {} } } }, // Add random field
      { $sort: { randomSort: 1 } }, // Sort by random field
      { $project: { randomSort: 0 } }, // Remove random field from results
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];

    const products = await Product.aggregate(productsPipeline);
    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts: totalCount,
        productsPerPage: limit,
      },
      products,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching products",
      error: error.message,
    });
  }
};

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

// Track product view function
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
      // Increment views count each time user views the product
      await ProductView.updateOne(filter, {
        $inc: { views: 1 },
        $set: { lastViewedAt: new Date() }
      });
    }
  } catch (error) {
    console.error("Error tracking product view:", error.message);
  }
}

exports.productsDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findOne({ "product.id": id });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "No product found.",
      });
    }

    // Track product view - get userId from token if available
    const userId = req.user?._id || null;
    await trackProductView(product._id, userId);

    return res.json({
      _id: product._id,
      product: product.product,
      variantsData: product.variantsData,
      totalQty: product.totalQty,
    });

    // return res.status(200).json({
    //     success: true,
    //     product: product,
    // });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching product.",
    });
  }
};

exports.getCategoryNameById = async (req, res) => {
  const { id } = req.params;

  try {
    // Search all documents where search_categoriesList contains an object with the matching id
    const categoryDoc = await Category.findOne({
      search_categoriesList: { $elemMatch: { id } },
    });

    if (!categoryDoc) {
      return res.status(404).json({ message: "Category ID not found" });
    }

    // Find the specific item inside the array
    const item = categoryDoc.search_categoriesList.find((cat) => cat.id === id);

    if (!item) {
      return res
        .status(404)
        .json({ message: "ID found in doc but not in array" });
    }

    // Split the name and get only the first/main category
    const mainCategory = item.name.split(/\s*\/\s*/)[0];

    return res.status(200).json({ name: mainCategory });
  } catch (error) {
    console.error("Error fetching category name:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getBrandNameById = async (req, res) => {
  const { id } = req.params;

  try {
    const brand = await Brand.findOne({ id: id }).select("id name");
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }
    res.json({
      brand: {
        id: brand.id,
        name: brand.name,
      },
    });
  } catch (error) {
    console.error("Error fetching brand name:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// exports.brands = async (req, res) => {
//   try {
//     const brandsData = await fetchBrands(); // Should return { data: [...] }
//     // Extract only id and name from each brand object
//     const simplifiedBrands = brandsData.data.map((brand) => ({
//       id: brand.id,
//       name: brand.name,
//     }));

//     // Optionally, save to MongoDB (bulk insert)
//     await Brand.insertMany(simplifiedBrands, { ordered: false });

//     console.log("Return - API - All Brands");
//     res.json({
//       success: true,
//       message: "Brands processed and saved to the database successfully.",
//     });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to fetch or save brands" });
//   }
// };

exports.brands = async (req, res) => {
  try {
    const brandsData = await fetchBrands(); // Should return { data: [...] }
    if (!brandsData.data || !Array.isArray(brandsData.data)) {
      return res.status(500).json({ error: "brandsData.data is not an array" });
    }
    const simplifiedBrands = brandsData.data.map((brand) => ({
      id: brand.id,
      name: brand.name,
    }));

    // Use upsert to avoid duplicate key errors
    const bulkOps = simplifiedBrands.map((brand) => ({
      updateOne: {
        filter: { id: brand.id },
        update: { $set: { name: brand.name } },
        upsert: true,
      },
    }));
    await Brand.bulkWrite(bulkOps);

    console.log("Return - API - All Brands");
    res.json({
      success: true,
      message: "Brands processed and saved to the database successfully.",
    });
  } catch (error) {
    console.error("Brands API error:", error);
    res.status(500).json({ error: "Failed to fetch or save brands" });
  }
};

exports.categories = async (req, res) => {
  try {
    const categories = await fetchCategories();
    let allProducts = await Product.find();
    allProducts = allProducts.filter((product) => product.status === true);

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
      // await Category.updateOne({}, categoryData);
      console.log("Categories updated in database.");
    } else {
      const newCategory = new Category(categoryData);
      await newCategory.save();
      console.log("Categories saved to database.");
    }

    console.log("Return - API - All Categories");
    res.json({
      success: true,
      message: "Categories processed and saved to the database successfully.",
    });
  } catch (error) {
    console.error("Error fetching categories or products:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch or save categories or products." });
  }
};

exports.downloadFile = async (req, res) => {
  const fileUrl = req.query.url;
  try {
    const response = await axios.get(fileUrl, { responseType: "stream" });
    const filename = path.basename(fileUrl);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.data.pipe(res);
  } catch (error) {
    console.error("Error downloading the file:", error);
    res.status(500).send("Failed to download the file.");
  }
};

exports.fetchDbProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = req.query.search || "";
    const status = req.query.status; // true/false or undefined
    const qty = req.query.qty; // "0" or "greater" or undefined

    const escapeRegex = (string) =>
      string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const safeSearchQuery = escapeRegex(searchQuery);

    let query = {};

    if (status !== undefined) {
      const statusValue = status === "true" || status === true;
      query.status = statusValue;
    }

    if (qty !== undefined) {
      if (qty === "0") {
        query.totalQty = { $eq: 0 };
      } else if (qty === "greater" || qty === "gt") {
        query.totalQty = { $gt: 0 };
      } else if (qty === "gte") {
        query.totalQty = { $gte: 0 };
      }
    }

    if (searchQuery) {
      const searchConditions = {
        $or: [
          {
            "product.name": {
              $regex: `.*${safeSearchQuery}.*`,
              $options: "i",
            },
          },
          {
            "product.description": {
              $regex: `.*${safeSearchQuery}.*`,
              $options: "i",
            },
          },
          {
            "product.sku_number": {
              $regex: `.*${safeSearchQuery}.*`,
              $options: "i",
            },
          },
        ],
      };

      if (Object.keys(query).length > 0) {
        query = {
          $and: [query, searchConditions],
        };
      } else {
        query = searchConditions;
      }
    }

    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalCount = await Product.countDocuments(query).exec();

    res.json({
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      products,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

exports.fetchProductsNoImages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const searchQuery = req.query.search || "";

    const escapeRegex = (string) =>
      string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const safeSearchQuery = escapeRegex(searchQuery);

    // Query to find products with no images using MongoDB aggregation
    // Products that don't have images array or have empty images array
    let query = {
      $or: [
        { "product.images": { $exists: false } },
        { "product.images": null },
        { "product.images": [] },
        { $expr: { $eq: [{ $size: { $ifNull: ["$product.images", []] } }, 0] } }
      ]
    };

    // Add search condition if search query is provided
    if (searchQuery) {
      const searchCondition = {
        "product.name": {
          $regex: `.*${safeSearchQuery}.*`,
          $options: "i",
        }
      };

      query = {
        $and: [query, searchCondition]
      };
    }

    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const totalCount = await Product.countDocuments(query).exec();

    res.json({
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      products,
    });
  } catch (error) {
    console.error("Error fetching products with no images:", error);
    res.status(500).json({ error: "Failed to fetch products with no images" });
  }
};

exports.tabbyWebhook = async (req, res) => {
  try {
    // --- Security checks ---

    const user_id = req.user._id;

    const allowedIPs = process.env.TABBY_IPS.split(",");
    const forwardedIps = (req.headers["x-forwarded-for"] || "").split(",");
    const clientIP = forwardedIps[0]?.trim() || req.socket.remoteAddress;
    if (!allowedIPs.includes(clientIP))
      return res.status(403).send("Forbidden IP");

    const secret = req.headers["x-webhook-secret"];
    if (secret !== process.env.TABBY_WEBHOOK_SECRET)
      return res.status(401).send("Unauthorized");

    // --- Parse payload ---
    let data;
    if (Buffer.isBuffer(req.body)) {
      data = JSON.parse(req.body.toString("utf-8"));
    } else if (typeof req.body === "object") {
      data = req.body;
    } else {
      throw new Error("Unexpected req.body type");
    }

    const { id: paymentId } = data;
    if (!paymentId) return res.status(400).send("paymentId missing");

    // --- Retrieve payment status from Tabby ---
    const paymentResp = await axios.get(
      `https://api.tabby.ai/api/v2/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` },
      }
    );
    const payment = paymentResp.data;
    const status = payment.status?.toUpperCase();

    // --- If AUTHORIZED, capture payment ---
    if (status === "AUTHORIZED") {
      const captureResp = await axios.post(
        `https://api.tabby.ai/api/v2/payments/${paymentId}/captures`,
        { amount: payment.amount },
        { headers: { Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}` } }
      );
      if (captureResp.data.status?.toUpperCase() !== "CLOSED") {
        return res.status(500).send("Capture failed");
      }
    }

    // --- After capture or if already CLOSED, create order ---
    const finalStatus = status === "AUTHORIZED" ? "CLOSED" : status;
    if (finalStatus === "CLOSED") {
      await createOrderAndSendEmails(payment, user_id);

      return res.status(200).send("Order processed");
    }

    return res.status(200).send("Webhook received");
  } catch (error) {
    console.error("Tabby webhook error:", error);
    return res.status(500).send("Internal server error");
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
          // update = await updateQuantity(lightspeedVariantId, updateQty, name, lightspeedVariantId);
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
                variantsData = Array.isArray(currentDoc.variantsData) ? currentDoc.variantsData.map((v) => ({ ...v })) : [];
              }
            } else {
              variantsData = Array.isArray(currentDoc.variantsData) ? currentDoc.variantsData.map((v) => ({ ...v })) : [];
            }
            const variantIndex = variantsData.findIndex((v) => String(v.id) === String(lightspeedVariantId));
            if (variantIndex >= 0) {
              variantsData[variantIndex].qty = updateQty;
            } else {
              variantsData.push({ id: lightspeedVariantId, qty: updateQty });
            }
            const totalQty = variantsData.reduce((sum, v) => sum + (Number(v.qty) || 0), 0);
            const productStatus = totalQty > 0 ? true : false;
            updatedEntry = await Product.findByIdAndUpdate(
              mongoObjectId,
              {
                $set: { variantsData, totalQty, status: productStatus },
                $inc: { sold: qtySold },
              },
              { new: true }
            );
            if (updatedEntry) {
              const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
              const qtyMsg = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER: Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty} QtySold=${item.qty}`;
              await logActivity({
                platform: 'Website Backend',
                log_type: 'backend_activity',
                action: 'Inventory Update',
                status: 'success',
                message: `Product ${name} updated successfully. ${qtyMsg}`,
                user: null,
                details: {
                  order_id: orderId,
                  product_id: lightspeedVariantId?.toString?.(),
                  product_name: name,
                  qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
                  qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
                  expected_after: updateQty,
                  qty_sold: item.qty,
                  total_before: item.total_qty,
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
                execution_path: 'publicController.updateQuantities -> Product.findOneAndUpdate'
              });
            } else {
              const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
              const qtyMsgFail = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER: Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty}. Local DB sync FAILED.`;
              await logActivity({
                platform: 'Website Backend',
                log_type: 'backend_activity',
                action: 'Inventory Update',
                status: 'failure',
                message: `Product ${name} - Lightspeed updated but local DB NOT synced. ${qtyMsgFail}`,
                user: null,
                details: {
                  order_id: orderId,
                  product_id: lightspeedVariantId?.toString?.(),
                  product_name: name,
                  error_details: 'findOneAndUpdate returned null - product may not exist in local DB',
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
                message: `Product ${name} - local DB sync failed. ${qtyMsgFail}`,
                product_id: lightspeedVariantId?.toString?.(),
                product_name: name,
                order_id: orderId,
                execution_path: 'publicController.updateQuantities -> Product.findOneAndUpdate',
                error_details: `findOneAndUpdate returned null. ${qtyMsgFail}`
              });
            }
          } catch (dbError) {
            throw dbError;
          }
        } else {
          const afterDiag = await getDiagnosticInventory(lightspeedVariantId);
          const qtyMsgLsFail = `BEFORE: Lightspeed=${beforeDiag.lightspeedQty} Local=${beforeDiag.localQty} | AFTER (unchanged): Lightspeed=${afterDiag.lightspeedQty} Local=${afterDiag.localQty} | Expected=${updateQty}. Lightspeed API update FAILED.`;
          await logActivity({
            platform: 'Website Backend',
            log_type: 'backend_activity',
            action: 'Inventory Update',
            status: 'failure',
            message: `Product ${name} - Lightspeed API update failed. ${qtyMsgLsFail}`,
            user: null,
            details: {
              order_id: orderId,
              product_id: lightspeedVariantId?.toString?.(),
              product_name: name,
              error_details: 'Lightspeed API updateQuantity returned false',
              qty_before: { lightspeed: beforeDiag.lightspeedQty, local: beforeDiag.localQty },
              qty_after: { lightspeed: afterDiag.lightspeedQty, local: afterDiag.localQty },
              expected_after: updateQty,
              qty_sold: item.qty,
              lightspeedError: beforeDiag.lightspeedError || undefined,
            }
          });
          await logBackendActivity({
            platform: 'Website Backend',
            activity_name: 'Product Database Update',
            status: 'failure',
            message: `Product ${name} - Lightspeed API failed. ${qtyMsgLsFail}`,
            product_id: lightspeedVariantId?.toString?.(),
            product_name: name,
            order_id: orderId,
            execution_path: 'publicController.updateQuantities -> Lightspeed API',
            error_details: qtyMsgLsFail
          });
        }

        emailDetails.push({
          productName: name,
          variantId: lightspeedVariantId,
          qtySold: item.qty,
          qtyRemaining: updateQty,
          updateStatus: update ? "Successful" : "Failed",
        });

        console.log(
          `Update for product ID ${lightspeedVariantId?.toString?.()}, Name ${name} was ${
            update ? "successful" : "failed"
          }`
        );
        return update;
      })
    );

    console.log("All updates completed:", updateResults);
    await updateQuantityMail(emailDetails);
    
    const successCount = updateResults.filter(r => r === true).length;
    const failureCount = updateResults.filter(r => r === false).length;
    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Inventory Update Batch',
      status: successCount > 0 ? 'success' : 'failure',
      message: `Inventory update completed: ${successCount} success, ${failureCount} failed`,
      order_id: orderId,
      execution_path: 'publicController.updateQuantities'
    });
    
    return updateResults;
  } catch (error) {
    console.error("Error in updating quantities for the cart:", error);
    
    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Inventory Update Batch',
      status: 'failure',
      message: `Inventory update batch failed: ${error.message}`,
      order_id: orderId,
      execution_path: 'publicController.updateQuantities',
      error_details: error.message
    });
    
    return [];
  }
}

async function updateQuantity(id, updateQty, productName = null, productId = null) {
  try {
    const productsResponse = await axios.put(
      `${PRODUCTS_UPDATE}/${productId}`,
      {
        details: {
          inventory: [
            {
              outlet_id: "06f2e29c-25cb-11ee-ea12-904089a077d7",
              current_amount: updateQty,
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: "application/json",
        },
      }
    );

    if (productsResponse.status === 200) {
      console.log(`Successfully updated quantity for product with ID: ${id}`);
      
      // Log successful inventory update
      await logBackendActivity({
        platform: 'Website Backend',
        activity_name: 'Inventory Update',
        status: 'success',
        message: `Inventory updated for ${productName || 'product'} - Qty: ${updateQty}`,
        product_id: productId ? productId.toString() : id.toString(),
        product_name: productName || `Product ${id}`,
        execution_path: 'publicController.updateQuantity -> Lightspeed API'
      });
      
      return true;
    } else {
      console.warn(`Unexpected response status: ${productsResponse.status}`);
      
      // Log failed inventory update
      await logBackendActivity({
        platform: 'Website Backend',
        activity_name: 'Inventory Update',
        status: 'failure',
        message: `Inventory update failed for ${productName || 'product'}`,
        product_id: productId ? productId.toString() : id.toString(),
        product_name: productName || `Product ${id}`,
        execution_path: 'publicController.updateQuantity -> Lightspeed API',
        error_details: `Unexpected response status: ${productsResponse.status}`
      });
      
      return false;
    }
  } catch (error) {
    console.warn(
      "Error updating product from Lightspeed:",
      error.response ? error.response.data : error.message
    );
    
    // Log error
    await logBackendActivity({
      platform: 'Website Backend',
      activity_name: 'Inventory Update',
      status: 'failure',
      message: `Inventory update error for ${productName || 'product'}`,
      product_id: productId ? productId.toString() : id.toString(),
      product_name: productName || `Product ${id}`,
      execution_path: 'publicController.updateQuantity -> Lightspeed API',
      error_details: error.response ? JSON.stringify(error.response.data) : error.message
    });
    
    return false;
  }
}

async function updateQuantityMail(emailDetails) {
  try {
    const email = await getAdminEmail();
    const logoUrl = `${WEBURL}/images/logo.png`;
    const subject = "Inventory Update Report - Bazaar";
    const html = `
                <body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; padding-left: 25px; padding-right: 25px; background-color: #f2f3f8;" leftmargin="0">
                    <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: 'Open Sans', sans-serif;">
                        <tr>
                            <td>
                                <table style="background-color: #f2f3f8; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="height:40px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <a href="https://www.bazaar-uae.com" style="padding-top: 20px; padding-right: 20px; padding-left: 20px; padding-bottom: 15px;" title="logo" target="_blank">
                                                <img width="110" src="${logoUrl}" title="logo" alt="logo">
                                            </a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;"><b>Product Quantity Update Report</b></p>
                                            <p style="color: #455056; font-size: 16px; line-height: 20px; font-weight: 600; margin-top: 0px; margin-bottom: 6px;">The following products have been updated in the inventory:</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" style="text-align: center; margin-top: 20px; background:#fff; border-radius:3px; box-shadow:0 6px 18px 0 rgba(0,0,0,.06);">
                                                <thead style="text-align: center;">
                                                    <tr style="background-color: #f8f9fa; text-align: center;">
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Product Name</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Variant ID</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Quantity Sold</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Quantity Remaining</th>
                                                        <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd; text-align: center;">Update Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody style="font-size: 14px; margin-top: 20px; margin-bottom: 20px; padding-top: 10px; padding-bottom: 10px;">
                                                    ${emailDetails
                                                      .map(
                                                        (item) => `
                                                        <tr>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.productName}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.variantId}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.qtySold}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.qtyRemaining}</td>
                                                            <td style="margin-top: 10px; margin-bottom: 10px; padding-top: 10px; padding-bottom: 10px;">${item.updateStatus}</td>
                                                        </tr>
                                                    `
                                                      )
                                                      .join("")}
                                                </tbody>
                                            </table>
                                            <p style="margin-top:20px;">Please log in to the dashboard to confirm the updates.</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="height:20px;">&nbsp;</td>
                                    </tr>
                                    <tr>
                                        <td style="text-align:center;">
                                            <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0; padding-left: 15px; padding-right: 15px;">&copy; <strong>bazaar-uae.com</strong> </p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="height:80px;">&nbsp;</td>
                                    </tr>
                                </table>
                            </body>`;

    await sendEmail(email, subject, html);
  } catch (error) {
    console.warn(
      "Error sending mail to admin:",
      error.response ? error.response.data : error.message
    );
    return false;
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
}

async function filterAndCacheProductsByInventory(productsResponse) {
  try {
    const cacheKey = "filtered_products_inventory";
    const cachedProducts = cache.get(cacheKey);

    if (cachedProducts) {
      console.log("Fetching filtered products from cache");
      return cachedProducts;
    }

    console.log("Fetching filtered products from Lightspeed API");

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

    // Cache the filtered products
    cache.set(cacheKey, filteredProducts);

    return filteredProducts;
  } catch (error) {
    console.error("Error filtering products by inventory:", error.message);
    throw new Error("Failed to filter products by inventory");
  }
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
  try {
    const cacheKey = "lightspeed_products";
    const cachedProducts = cache.get(cacheKey);

    if (cachedProducts) {
      console.log("Fetching products from cache");
      return cachedProducts;
    }

    console.log("Fetching products from Lightspeed API");

    const response = await axios.get(PRODUCTS_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
    });

    const products = response.data.data || [];

    const activeProducts = products.filter(
      (product) => product.is_active === true
    );

    cache.set(cacheKey, activeProducts);

    return activeProducts;
  } catch (error) {
    console.error("Error fetching products:", error.message);

    if (error.response && error.response.status >= 500) {
      throw new Error("Server error while fetching product");
    }

    throw new Error("Failed to fetch product");
  }
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
    console.warn("Error fetching products from Lightspeed:", error.message);
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

async function autoCacheProducts() {
  try {
    console.log("Running scheduled cache refresh...");
    // const productsResponse = await fetchAndCacheProducts();
    let productsResponse = await Product.find();
    productsResponse = productsResponse.filter(
      (product) => product.status === true
    );
    await filterAndCacheProductsByInventory(productsResponse);
  } catch (error) {
    console.error("Error in scheduled cache refresh:", error.message);
  }
}

const generateCouponCode = async () => {
  try {
    let nextNumber = 1; // Default to 1 if no coupons exist
    const coupons = await Coupon.find(); // Newest first

    if (coupons && coupons.length > 0) {
      const lastCoupon = coupons[coupons.length - 1].coupon; // Get the latest coupon
      console.log("lastCoupon:", lastCoupon);

      const regex = /DH(\d+)YHZXB/; // Match the numeric part of the coupon code
      const matches = lastCoupon.match(regex);

      if (matches && matches[1]) {
        nextNumber = parseInt(matches[1], 10) + 1; // Increment the numeric part
      }
    }

    const newCoupon = `DH${nextNumber}YHZXB`;
    return newCoupon;
  } catch (error) {
    console.error("Error generating the coupon code:", error);
    return "DH1YHZXB"; // Default fallback if no coupons exist or there's an error
  }
};

const storeProductDetails = async (productIds, res, isProcessing) => {
  try {
    let count = 0;
    for (const id of productIds) {
      if (!isProcessing || !isClientConnected(res)) {
        console.log("Processing stopped due to client disconnection");
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
    console.log("Products stored and processed successfully.");
    if (isClientConnected(res)) {
      return res.status(200).json({
        message: "Products stored and processed successfully.",
      });
    }
  } catch (error) {
    console.error("Error processing product details:", error.message);
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
    console.error(
      `Error fetching product details for ID: ${id}`,
      error.message
    );
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

    // Ensure correct structure
    if (response?.data?.data) {
      return response.data.data;
    }

    console.error("Invalid promotion response format.");
    return null;

  } catch (error) {
    console.error(
      `Error fetching coupon details for ID: ${id} ->`,
      error.response?.data || error.message
    );
    return null; // safer than throw
  }
};