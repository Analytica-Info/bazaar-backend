'use strict';

const SliderCms = require('../../../repositories').sliderCms.rawModel();
const deleteOldFile = require('../../../utils/deleteOldFile');
const clock = require('../../../utilities/clock');
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

const BACKEND_URL = process.env.BACKEND_URL;

/**
 * Update 3 slider images
 * @param {Object} data - (unused currently)
 * @param {Object} files - { sliderImage1, sliderImage2, sliderImage3 }
 */
async function updateSlider(data, files) {
    try {
        const sliderImage1 = files?.sliderImage1 || null;
        const sliderImage2 = files?.sliderImage2 || null;
        const sliderImage3 = files?.sliderImage3 || null;

        let sliderCms = await SliderCms.findOne();
        if (!sliderCms) sliderCms = new SliderCms();

        if (sliderImage1) {
            deleteOldFile(sliderCms.sliderImage1);
            sliderCms.sliderImage1 = `${BACKEND_URL}/uploads/cms/SliderImages/${sliderImage1.filename}?v=${clock.nowMs()}`;
        }
        if (sliderImage2) {
            deleteOldFile(sliderCms.sliderImage2);
            sliderCms.sliderImage2 = `${BACKEND_URL}/uploads/cms/SliderImages/${sliderImage2.filename}?v=${clock.nowMs()}`;
        }
        if (sliderImage3) {
            deleteOldFile(sliderCms.sliderImage3);
            sliderCms.sliderImage3 = `${BACKEND_URL}/uploads/cms/SliderImages/${sliderImage3.filename}?v=${clock.nowMs()}`;
        }

        await sliderCms.save();
        await invalidateCmsCache();
        return { message: "Slider Images CMS data uploaded successfully" };
    } catch (error) {
        console.error(error);
        throw { status: 500, message: "Error uploading Slider Images CMS data" };
    }
}

module.exports = { updateSlider };
