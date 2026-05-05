'use strict';

const FeaturesCms = require('../../../repositories').featuresCms.rawModel();
const { invalidateCmsCache } = require('../domain/cacheInvalidation');

/**
 * Update features array
 * @param {Object} data - { features: [{ title, paragraph }] }
 */
async function updateFeatures(data) {
    try {
        const { features } = data;
        if (!Array.isArray(features)) {
            throw { status: 400, message: "Features must be an array" };
        }

        let featureCms = await FeaturesCms.findOne();
        if (!featureCms) featureCms = new FeaturesCms();

        featureCms.featureData = features.map((f) => ({
            title: f?.title || "",
            paragraph: f?.paragraph || "",
        }));
        await featureCms.save();

        await invalidateCmsCache();
        return { message: "Data uploaded successfully" };
    } catch (error) {
        if (error.status) throw error;
        console.error(error);
        throw { status: 500, message: "Error uploading data" };
    }
}

module.exports = { updateFeatures };
