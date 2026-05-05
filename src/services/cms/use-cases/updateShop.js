'use strict';

const ShopCms = require('../../../repositories').shops.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update shop page images
 * @param {Object} data - (unused)
 * @param {Object} files - { Image1, Image2 }
 */
async function updateShop(data, files) {
    try {
        const Image1 = files?.Image1 || null;
        const Image2 = files?.Image2 || null;

        let shopCms = await ShopCms.findOne();
        if (!shopCms) shopCms = new ShopCms();

        if (Image1) {
            deleteOldFile(shopCms.Image1);
            shopCms.Image1 = `${BACKEND_URL}/uploads/cms/Shop/${Image1.filename}?v=${clock.nowMs()}`;
        }
        if (Image2) {
            deleteOldFile(shopCms.Image2);
            shopCms.Image2 = `${BACKEND_URL}/uploads/cms/Shop/${Image2.filename}?v=${clock.nowMs()}`;
        }

        await shopCms.save();
        await invalidateCmsCache();
        return { message: "Data uploaded successfully" };
    } catch (error) {
        console.error(error);
        throw { status: 500, message: "Error uploading data" };
    }
}

module.exports = { updateShop };
