'use strict';

const { getCmsData } = require('./use-cases/getCmsData');
const { updateCouponCms } = require('./use-cases/updateCouponCms');
const { getCouponCms } = require('./use-cases/getCouponCms');
const { updateHeader } = require('./use-cases/updateHeader');
const { updateSlider } = require('./use-cases/updateSlider');
const { updateFeatures } = require('./use-cases/updateFeatures');
const { updateOffers } = require('./use-cases/updateOffers');
const { updateCategoryImages } = require('./use-cases/updateCategoryImages');
const { updateOfferFilter } = require('./use-cases/updateOfferFilter');
const { updateFooter } = require('./use-cases/updateFooter');
const { updateAbout } = require('./use-cases/updateAbout');
const { updateShop } = require('./use-cases/updateShop');
const { updateContact } = require('./use-cases/updateContact');
const { updateBrandsLogo } = require('./use-cases/updateBrandsLogo');
const { uploadEditorImage, deleteEditorImage } = require('./use-cases/uploadEditorImage');
const { invalidateCmsCache } = require('./domain/cacheInvalidation');

module.exports = {
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
};
