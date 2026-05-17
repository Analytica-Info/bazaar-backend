'use strict';

const OffersCms = require('../../../repositories').offersCms.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update offers with images
 * @param {Object} data - { offerCategory: [] }
 * @param {Object} files - { offerImages: [fileObj, ...] }
 */
async function updateOffers(data, files) {
    try {
        const offerImages = files?.offerImages || [];
        const offerCategories = data.offerCategory || [];
        const categoriesArray = Array.isArray(offerCategories) ? offerCategories : [offerCategories];

        let offersCms = await OffersCms.findOne();
        if (!offersCms) offersCms = new OffersCms({ offersData: [] });

        let updatedOffersData = [...offersCms.offersData];

        offerImages.forEach((file, index) => {
            if (updatedOffersData[index]?.offerImage) {
                deleteOldFile(updatedOffersData[index].offerImage);
            }
            updatedOffersData[index] = {
                offerImage: `${BACKEND_URL}/uploads/cms/Offers/${file.filename}?v=${clock.nowMs()}`,
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
}

module.exports = { updateOffers };
