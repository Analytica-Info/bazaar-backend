const CouponCms = require("../models/CouponCms");
const HeaderInfoCms = require("../models/HeaderInfo");
const SliderCms = require("../models/SliderCms");
const FeaturesCms = require("../models/FeaturesCms");
const OffersCms = require("../models/OffersCms");
const CategoryImagesCms = require("../models/CategoriesCms");
const OfferFilterCms = require("../models/OfferFilter");
const FooterInfoCms = require("../models/FooterInfoCms");
const AboutCms = require("../models/About");
const ShopCms = require("../models/Shop");
const ContactCms = require("../models/ContactCms");
const BrandsLogoCms = require("../models/BrandsLogo");
const deleteOldFile = require("../utils/deleteOldFile");
const fs = require("fs");
const path = require("path");

const logger = require("../utilities/logger");
const cache = require("../utilities/cache");
const BACKEND_URL = process.env.BACKEND_URL;

// CMS content changes only via admin edits.
// Cache for 30 min; every update path below calls invalidateCmsCache().
const CMS_CACHE_KEY = cache.key("cms", "data", "v1");
const CMS_CACHE_TTL = 1800; // 30 min

/** Invalidate the cached CMS payload. Called from every update.* function. */
async function invalidateCmsCache() {
  try {
    await cache.del(CMS_CACHE_KEY);
  } catch (_) {
    // cache.del already swallows errors; this is belt-and-braces.
  }
}

exports.invalidateCmsCache = invalidateCmsCache;

// ─── Exported Functions ──────────────────────────────────────────

/**
 * Fetch all CMS sections
 */
exports.getCmsData = async () => {
  return cache.getOrSet(CMS_CACHE_KEY, CMS_CACHE_TTL, async () => {
    try {
      // Parallelize the 12 independent findOne() calls instead of sequential await.
      // Same result, but fetch completes in ~max(query) rather than ~sum(query).
      const [
        couponCms,
        headerInfoCms,
        sliderCms,
        featuresCms,
        offersCms,
        categoryImagesCms,
        offerFilterCms,
        footerInfoCms,
        aboutCms,
        shopCms,
        contactCms,
        brandsLogoCms,
      ] = await Promise.all([
        CouponCms.findOne().lean(),
        HeaderInfoCms.findOne().lean(),
        SliderCms.findOne().lean(),
        FeaturesCms.findOne().lean(),
        OffersCms.findOne().lean(),
        CategoryImagesCms.findOne().lean(),
        OfferFilterCms.findOne().lean(),
        FooterInfoCms.findOne().lean(),
        AboutCms.findOne().lean(),
        ShopCms.findOne().lean(),
        ContactCms.findOne().lean(),
        BrandsLogoCms.findOne().lean(),
      ]);

      return {
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
      };
    } catch (error) {
      logger.error(`Error fetching Cms data: ${error.message}`);
      throw {
        status: 500,
        message: "Error fetching Cms data",
      };
    }
  });
};

/**
 * Update coupon form CMS
 * @param {Object} data - { discountText, discountTextExtra, description, facebookLink, instagramLink, tikTokLink, youtubeLink }
 * @param {Object} files - { logo: filePath, mrBazaarLogo: filePath }
 */
exports.updateCouponCms = async (data, files) => {
  try {
    const {
      discountText,
      discountTextExtra,
      description,
      facebookLink,
      instagramLink,
      tikTokLink,
      youtubeLink,
    } = data;

    const logo = files?.logo || null;
    const mrBazaarLogo = files?.mrBazaarLogo || null;

    let couponCms = await CouponCms.findOne();
    if (!couponCms) {
      couponCms = new CouponCms();
    }

    couponCms.discountText = discountText;
    couponCms.discountTextExtra = discountTextExtra;
    couponCms.description = description;
    couponCms.facebookLink = facebookLink;
    couponCms.instagramLink = instagramLink;
    couponCms.tikTokLink = tikTokLink;
    couponCms.youtubeLink = youtubeLink;

    if (logo) {
      deleteOldFile(couponCms.logo);
      const relativePath = `/uploads/cms/CouponForm/${logo.filename}`;
      couponCms.logo = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    if (mrBazaarLogo) {
      deleteOldFile(couponCms.mrBazaarLogo);
      const relativePath = `/uploads/cms/CouponForm/${mrBazaarLogo.filename}`;
      couponCms.mrBazaarLogo = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    await couponCms.save();

    await invalidateCmsCache();
    return { message: "Coupon CMS data uploaded successfully" };
  } catch (error) {
    console.error(error);
    throw {
      status: 500,
      message: "Error uploading Coupon CMS data",
    };
  }
};

/**
 * Get coupon CMS data
 */
exports.getCouponCms = async () => {
  try {
    const couponCms = await CouponCms.findOne();
    if (!couponCms) {
      throw { status: 404, message: "CouponCms data not found" };
    }
    return { couponCmsData: couponCms };
  } catch (error) {
    if (error.status) throw error;
    logger.error(`Error fetching CouponCms data: ${error.message}`);
    throw {
      status: 500,
      message: "Error fetching CouponCms data",
    };
  }
};

/**
 * Update header info
 * @param {Object} data - { contactNumber }
 * @param {Object} files - { logo: fileObj }
 */
exports.updateHeader = async (data, files) => {
  try {
    const { contactNumber } = data;
    const logo = files?.logo || null;

    let headerInfo = await HeaderInfoCms.findOne();
    if (!headerInfo) {
      headerInfo = new HeaderInfoCms();
    }

    headerInfo.contactNumber = contactNumber;

    if (logo) {
      deleteOldFile(headerInfo.logo);
      const relativePath = `/uploads/cms/HeaderInfo/${logo.filename}`;
      headerInfo.logo = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    await headerInfo.save();
    await invalidateCmsCache();
    return { message: "Header info saved successfully" };
  } catch (error) {
    console.error(error);
    throw { status: 500, message: "Error saving header info" };
  }
};

/**
 * Update 3 slider images
 * @param {Object} data - (unused currently)
 * @param {Object} files - { sliderImage1, sliderImage2, sliderImage3 }
 */
exports.updateSlider = async (data, files) => {
  try {
    const sliderImage1 = files?.sliderImage1 || null;
    const sliderImage2 = files?.sliderImage2 || null;
    const sliderImage3 = files?.sliderImage3 || null;

    let sliderCms = await SliderCms.findOne();
    if (!sliderCms) {
      sliderCms = new SliderCms();
    }

    if (sliderImage1) {
      deleteOldFile(sliderCms.sliderImage1);
      const relativePath = `/uploads/cms/SliderImages/${sliderImage1.filename}`;
      sliderCms.sliderImage1 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    if (sliderImage2) {
      deleteOldFile(sliderCms.sliderImage2);
      const relativePath = `/uploads/cms/SliderImages/${sliderImage2.filename}`;
      sliderCms.sliderImage2 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    if (sliderImage3) {
      deleteOldFile(sliderCms.sliderImage3);
      const relativePath = `/uploads/cms/SliderImages/${sliderImage3.filename}`;
      sliderCms.sliderImage3 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    await sliderCms.save();

    await invalidateCmsCache();
    return { message: "Slider Images CMS data uploaded successfully" };
  } catch (error) {
    console.error(error);
    throw {
      status: 500,
      message: "Error uploading Slider Images CMS data",
    };
  }
};

/**
 * Update features array
 * @param {Object} data - { features: [{ title, paragraph }] }
 */
exports.updateFeatures = async (data) => {
  try {
    const { features } = data;

    if (!Array.isArray(features)) {
      throw { status: 400, message: "Features must be an array" };
    }

    let featureCms = await FeaturesCms.findOne();
    if (!featureCms) {
      featureCms = new FeaturesCms();
    }

    const featureData = features.map((f) => ({
      title: f?.title || "",
      paragraph: f?.paragraph || "",
    }));

    featureCms.featureData = featureData;
    await featureCms.save();

    await invalidateCmsCache();
    return { message: "Data uploaded successfully" };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw { status: 500, message: "Error uploading data" };
  }
};

/**
 * Update offers with images
 * @param {Object} data - { offerCategory: [] }
 * @param {Object} files - { offerImages: [fileObj, ...] }
 */
exports.updateOffers = async (data, files) => {
  try {
    const offerImages = files?.offerImages || [];
    const offerCategories = data.offerCategory || [];

    const categoriesArray = Array.isArray(offerCategories)
      ? offerCategories
      : [offerCategories];

    let offersCms = await OffersCms.findOne();
    if (!offersCms) {
      offersCms = new OffersCms({ offersData: [] });
    }

    let updatedOffersData = [...offersCms.offersData];

    offerImages.forEach((file, index) => {
      if (
        updatedOffersData[index] &&
        updatedOffersData[index].offerImage
      ) {
        deleteOldFile(updatedOffersData[index].offerImage);
      }

      updatedOffersData[index] = {
        offerImage: `${BACKEND_URL}/uploads/cms/Offers/${file.filename}?v=${Date.now()}`,
        offerCategory: categoriesArray[index] || "",
      };
    });

    offersCms.offersData = updatedOffersData;
    await offersCms.save();

    await invalidateCmsCache();
    return { message: "Offers updated successfully" };
  } catch (error) {
    console.error(error);
    throw { status: 500, message: "Error uploading offers" };
  }
};

/**
 * Update 5 category images
 * @param {Object} data - (unused)
 * @param {Object} files - { Electronics, Home, Sports, Toys, Home_Improvement }
 */
exports.updateCategoryImages = async (data, files) => {
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
      const file = files?.[category] || null;
      if (file) {
        deleteOldFile(categoryImagesCms[category]);
        const relativePath = `/uploads/cms/CategoryImages/${file.filename}`;
        categoryImagesCms[category] = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
      }
    }

    await categoryImagesCms.save();

    await invalidateCmsCache();
    return { message: "Data uploaded successfully" };
  } catch (error) {
    console.error(error);
    throw { status: 500, message: "Error uploading data" };
  }
};

/**
 * Update offer filter prices + images
 * @param {Object} data - { MinPrice1, MaxPrice1, MinPrice2, MaxPrice2 }
 * @param {Object} files - { Image1, Image2 }
 */
exports.updateOfferFilter = async (data, files) => {
  try {
    const { MinPrice1, MaxPrice1, MinPrice2, MaxPrice2 } = data;
    const Image1 = files?.Image1 || null;
    const Image2 = files?.Image2 || null;

    if (
      parseInt(MinPrice1) > parseInt(MaxPrice1) ||
      parseInt(MinPrice2) > parseInt(MaxPrice2)
    ) {
      throw { status: 400, message: "Invalid price range" };
    }

    let offerFilterCms = await OfferFilterCms.findOne();
    if (!offerFilterCms) {
      offerFilterCms = new OfferFilterCms();
    }

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

    if (Image1) {
      deleteOldFile(offerFilterCms.PriceRange1?.Image1);
      const relativePath = `/uploads/cms/OfferFilter/${Image1.filename}`;
      offerFilterCms.PriceRange1.Image1 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    if (Image2) {
      deleteOldFile(offerFilterCms.PriceRange2?.Image2);
      const relativePath = `/uploads/cms/OfferFilter/${Image2.filename}`;
      offerFilterCms.PriceRange2.Image2 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    await offerFilterCms.save();

    await invalidateCmsCache();
    return { message: "Data updated successfully" };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw { status: 500, message: "Error processing request" };
  }
};

/**
 * Update footer with social links
 * @param {Object} data - { tagLine, address, email, phone, facebook, tiktok, instagram, youtube }
 * @param {Object} files - { logo }
 */
exports.updateFooter = async (data, files) => {
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
    } = data;

    const logo = files?.logo || null;

    let footerInfoCms = await FooterInfoCms.findOne();
    if (!footerInfoCms) {
      footerInfoCms = new FooterInfoCms();
    }

    footerInfoCms.tagLine = tagLine;
    footerInfoCms.address = address;
    footerInfoCms.email = email;
    footerInfoCms.phone = phone;
    footerInfoCms.facebook = facebook;
    footerInfoCms.tiktok = tiktok;
    footerInfoCms.instagram = instagram;
    footerInfoCms.youtube = youtube;

    if (logo) {
      deleteOldFile(footerInfoCms.logo);
      const relativePath = `/uploads/cms/FooterInfo/${logo.filename}`;
      footerInfoCms.logo = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    await footerInfoCms.save();

    await invalidateCmsCache();
    return { message: "Data uploaded successfully" };
  } catch (error) {
    console.error(error);
    throw { status: 500, message: "Error uploading data" };
  }
};

/**
 * Update about page
 * @param {Object} data - { contents (JSON string or parsed array) }
 * @param {Object} files - { backgroundImage }
 */
exports.updateAbout = async (data, files) => {
  try {
    let contents = [];
    if (data.contents) {
      try {
        contents =
          typeof data.contents === "string"
            ? JSON.parse(data.contents)
            : data.contents;
      } catch (err) {
        throw { status: 400, message: "Invalid contents format" };
      }
    }

    const backgroundImage = files?.backgroundImage || null;

    let aboutCms = await AboutCms.findOne();
    if (!aboutCms) {
      aboutCms = new AboutCms();
    }

    aboutCms.contents = contents;

    if (backgroundImage) {
      deleteOldFile(aboutCms.backgroundImage);
      const relativePath = `/uploads/cms/About/${backgroundImage.filename}`;
      aboutCms.backgroundImage = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    await aboutCms.save();

    await invalidateCmsCache();
    return { message: "Data uploaded successfully" };
  } catch (error) {
    if (error.status) throw error;
    console.error(error);
    throw { status: 500, message: "Error uploading data" };
  }
};

/**
 * Update shop page images
 * @param {Object} data - (unused)
 * @param {Object} files - { Image1, Image2 }
 */
exports.updateShop = async (data, files) => {
  try {
    const Image1 = files?.Image1 || null;
    const Image2 = files?.Image2 || null;

    let shopCms = await ShopCms.findOne();
    if (!shopCms) {
      shopCms = new ShopCms();
    }

    if (Image1) {
      deleteOldFile(shopCms.Image1);
      const relativePath = `/uploads/cms/Shop/${Image1.filename}`;
      shopCms.Image1 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    if (Image2) {
      deleteOldFile(shopCms.Image2);
      const relativePath = `/uploads/cms/Shop/${Image2.filename}`;
      shopCms.Image2 = `${BACKEND_URL}${relativePath}?v=${Date.now()}`;
    }

    await shopCms.save();

    await invalidateCmsCache();
    return { message: "Data uploaded successfully" };
  } catch (error) {
    console.error(error);
    throw { status: 500, message: "Error uploading data" };
  }
};

/**
 * Update contact info
 * @param {Object} data - { tagLine, address, email, phone, facebook, tiktok, instagram }
 */
exports.updateContact = async (data) => {
  try {
    const { tagLine, address, email, phone, facebook, tiktok, instagram } =
      data;

    let contactCms = await ContactCms.findOne();
    if (!contactCms) {
      contactCms = new ContactCms();
    }

    contactCms.tagLine = tagLine;
    contactCms.address = address;
    contactCms.email = email;
    contactCms.phone = phone;
    contactCms.facebook = facebook;
    contactCms.tiktok = tiktok;
    contactCms.instagram = instagram;

    await contactCms.save();

    await invalidateCmsCache();
    return { message: "Data uploaded successfully" };
  } catch (error) {
    console.error(error);
    throw { status: 500, message: "Error uploading data" };
  }
};

/**
 * Update brands logo (up to 20 logos)
 * @param {Object} data - (unused)
 * @param {Object} files - { logo0, logo1, ..., logo19 }
 */
exports.updateBrandsLogo = async (data, files) => {
  try {
    let brandsLogoCms = await BrandsLogoCms.findOne();
    if (!brandsLogoCms) brandsLogoCms = new BrandsLogoCms();
    const oldImages = brandsLogoCms.images || [];
    const updatedImages = [...oldImages];

    for (let i = 0; i < 20; i++) {
      const file = files?.[`logo${i}`] || null;
      if (file) {
        updatedImages[i] = `${BACKEND_URL}/uploads/cms/BrandsLogo/${file.filename}?v=${Date.now()}`;
      }
    }

    brandsLogoCms.images = updatedImages;
    await brandsLogoCms.save();

    await invalidateCmsCache();
    return { message: "Data uploaded successfully" };
  } catch (error) {
    throw { status: 500, message: "Error uploading data" };
  }
};

/**
 * Rich text editor image upload
 * @param {string} filePath - the filename of the uploaded file
 */
exports.uploadEditorImage = async (filePath) => {
  try {
    if (!filePath) {
      throw { status: 400, message: "Missing required file" };
    }
    const fileUrl = `${BACKEND_URL}/uploads/EditorBodyImages/${filePath}`;

    return {
      uploaded: 1,
      url: fileUrl,
    };
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Error uploading file:");
    throw { status: 500, message: "Failed to upload file" };
  }
};

/**
 * Delete uploaded editor image
 * @param {string} fileUrl - the full URL of the file to delete
 */
exports.deleteEditorImage = async (fileUrl) => {
  try {
    const extractFileNameFromUrl = (url) => {
      try {
        const parsedUrl = new URL(url);
        return path.basename(parsedUrl.pathname);
      } catch {
        return null;
      }
    };

    const fileName = extractFileNameFromUrl(fileUrl);
    if (!fileName) {
      throw { status: 400, message: "Invalid URL: No filename found" };
    }

    const uploadsDir = path.join(
      __dirname,
      "../uploads/EditorBodyImages"
    );
    const filePath = path.join(uploadsDir, fileName);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return { success: true, message: "File deleted successfully" };
    } else {
      throw { status: 404, message: "File not found on server" };
    }
  } catch (error) {
    if (error.status) throw error;
    logger.error({ err: error }, "Error deleting file:");
    throw { status: 500, message: error.message };
  }
};
