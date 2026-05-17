'use strict';

const CouponCms = require('../../../repositories').couponCms.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update coupon form CMS
 * @param {Object} data
 * @param {Object} files
 */
async function updateCouponCms(data, files) {
    try {
        const { discountText, discountTextExtra, description, facebookLink, instagramLink, tikTokLink, youtubeLink } = data;

        const logo = files?.logo || null;
        const mrBazaarLogo = files?.mrBazaarLogo || null;

        let couponCms = await CouponCms.findOne();
        if (!couponCms) couponCms = new CouponCms();

        couponCms.discountText = discountText;
        couponCms.discountTextExtra = discountTextExtra;
        couponCms.description = description;
        couponCms.facebookLink = facebookLink;
        couponCms.instagramLink = instagramLink;
        couponCms.tikTokLink = tikTokLink;
        couponCms.youtubeLink = youtubeLink;

        if (logo) {
            deleteOldFile(couponCms.logo);
            couponCms.logo = `${BACKEND_URL}/uploads/cms/CouponForm/${logo.filename}?v=${clock.nowMs()}`;
        }

        if (mrBazaarLogo) {
            deleteOldFile(couponCms.mrBazaarLogo);
            couponCms.mrBazaarLogo = `${BACKEND_URL}/uploads/cms/CouponForm/${mrBazaarLogo.filename}?v=${clock.nowMs()}`;
        }

        await couponCms.save();
        await invalidateCmsCache();
        return { message: "Coupon CMS data uploaded successfully" };
    } catch (error) {
        console.error(error);
        throw { status: 500, message: "Error uploading Coupon CMS data" };
    }
}

module.exports = { updateCouponCms };
