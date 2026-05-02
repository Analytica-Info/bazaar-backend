'use strict';

const OfferFilterCms = require('../../../repositories').offerFilters.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update offer filter prices + images
 * @param {Object} data - { MinPrice1, MaxPrice1, MinPrice2, MaxPrice2 }
 * @param {Object} files - { Image1, Image2 }
 */
async function updateOfferFilter(data, files) {
    try {
        const { MinPrice1, MaxPrice1, MinPrice2, MaxPrice2 } = data;
        const Image1 = files?.Image1 || null;
        const Image2 = files?.Image2 || null;

        if (parseInt(MinPrice1) > parseInt(MaxPrice1) || parseInt(MinPrice2) > parseInt(MaxPrice2)) {
            throw { status: 400, message: "Invalid price range" };
        }

        let offerFilterCms = await OfferFilterCms.findOne();
        if (!offerFilterCms) offerFilterCms = new OfferFilterCms();

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
            offerFilterCms.PriceRange1.Image1 = `${BACKEND_URL}/uploads/cms/OfferFilter/${Image1.filename}?v=${clock.nowMs()}`;
        }
        if (Image2) {
            deleteOldFile(offerFilterCms.PriceRange2?.Image2);
            offerFilterCms.PriceRange2.Image2 = `${BACKEND_URL}/uploads/cms/OfferFilter/${Image2.filename}?v=${clock.nowMs()}`;
        }

        await offerFilterCms.save();
        await invalidateCmsCache();
        return { message: "Data updated successfully" };
    } catch (error) {
        if (error.status) throw error;
        console.error(error);
        throw { status: 500, message: "Error processing request" };
    }
}

module.exports = { updateOfferFilter };
