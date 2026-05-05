'use strict';

const BrandsLogoCms = require('../../../repositories').brandsLogos.rawModel();
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update brands logo (up to 20 logos)
 * @param {Object} data - (unused)
 * @param {Object} files - { logo0, logo1, ..., logo19 }
 */
async function updateBrandsLogo(data, files) {
    try {
        let brandsLogoCms = await BrandsLogoCms.findOne();
        if (!brandsLogoCms) brandsLogoCms = new BrandsLogoCms();
        const oldImages = brandsLogoCms.images || [];
        const updatedImages = [...oldImages];

        for (let i = 0; i < 20; i++) {
            const file = files?.[`logo${i}`] || null;
            if (file) {
                updatedImages[i] = `${BACKEND_URL}/uploads/cms/BrandsLogo/${file.filename}?v=${clock.nowMs()}`;
            }
        }

        brandsLogoCms.images = updatedImages;
        await brandsLogoCms.save();

        await invalidateCmsCache();
        return { message: "Data uploaded successfully" };
    } catch (error) {
        throw { status: 500, message: "Error uploading data" };
    }
}

module.exports = { updateBrandsLogo };
