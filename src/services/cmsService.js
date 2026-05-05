'use strict';

/**
 * CMS service facade.
 *
 * Thin re-export layer — all logic lives in src/services/cms/.
 * Controllers import from here; the public API is unchanged.
 */

const {
    getCmsData,
    updateCouponCms,
    getCouponCms,
    updateHeader,
    updateSlider,
    updateFeatures,
    updateOffers,
    updateCategoryImages,
    updateOfferFilter,
    updateFooter,
    updateAbout,
    updateShop,
    updateContact,
    updateBrandsLogo,
    uploadEditorImage,
    deleteEditorImage,
    invalidateCmsCache,
} = require('./cms');

exports.getCmsData = getCmsData;
exports.updateCouponCms = updateCouponCms;
exports.getCouponCms = getCouponCms;
exports.updateHeader = updateHeader;
exports.updateSlider = updateSlider;
exports.updateFeatures = updateFeatures;
exports.updateOffers = updateOffers;
exports.updateCategoryImages = updateCategoryImages;
exports.updateOfferFilter = updateOfferFilter;
exports.updateFooter = updateFooter;
exports.updateAbout = updateAbout;
exports.updateShop = updateShop;
exports.updateContact = updateContact;
exports.updateBrandsLogo = updateBrandsLogo;
exports.uploadEditorImage = uploadEditorImage;
exports.deleteEditorImage = deleteEditorImage;
exports.invalidateCmsCache = invalidateCmsCache;
