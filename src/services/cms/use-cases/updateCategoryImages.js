'use strict';

const CategoryImagesCms = require('../../../repositories').categoriesCms.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

const CATEGORIES = ["Electronics", "Home", "Sports", "Toys", "Home_Improvement"];

/**
 * Update 5 category images
 * @param {Object} data - (unused)
 * @param {Object} files - { Electronics, Home, Sports, Toys, Home_Improvement }
 */
async function updateCategoryImages(data, files) {
    try {
        let categoryImagesCms = await CategoryImagesCms.findOne();
        if (!categoryImagesCms) categoryImagesCms = new CategoryImagesCms();

        for (const category of CATEGORIES) {
            const file = files?.[category] || null;
            if (file) {
                deleteOldFile(categoryImagesCms[category]);
                categoryImagesCms[category] = `${BACKEND_URL}/uploads/cms/CategoryImages/${file.filename}?v=${clock.nowMs()}`;
            }
        }

        await categoryImagesCms.save();
        await invalidateCmsCache();
        return { message: "Data uploaded successfully" };
    } catch (error) {
        console.error(error);
        throw { status: 500, message: "Error uploading data" };
    }
}

module.exports = { updateCategoryImages };
